import type { INestApplication } from "@nestjs/common";
import { totpAt } from "../src/common/security/totp";
import { Client, createTestApp, PASSWORD, prisma, registerUser } from "./helpers";

function currentCode(secret: string, offset = 0): string {
  return totpAt(secret, Math.floor(Date.now() / 30_000) + offset);
}

describe("support tickets, settings, admin operations and 2FA", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  async function staff(role: "SUPER_ADMIN" | "SUPPORT") {
    const user = await registerUser(app);
    await prisma(app).user.update({ where: { id: user.userId }, data: { platformRole: role } });
    return user;
  }

  it("runs a ticket conversation between a customer and support, isolated per organization", async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const support = await staff("SUPPORT");
    const base = `/organizations/${a.orgId}/tickets`;

    const { body: t } = await a.client
      .post(base, { subject: "ارسال کمپین متوقف شد", category: "TECHNICAL", priority: "HIGH", body: "کمپین دیروز ارسال نشد." })
      .expect(201);
    await a.client.post(base, { subject: "", body: "x" }).expect(400);
    await b.client.get(`${base}/${t.id}`).expect(404);
    await b.client.get(`/organizations/${b.orgId}/tickets/${t.id}`).expect(404);

    const queue = await support.client.get("/admin/tickets?status=OPEN").expect(200);
    expect(queue.body.items.some((x: { id: string }) => x.id === t.id)).toBe(true);
    await support.client.post(`/admin/tickets/${t.id}/messages`, { body: "بررسی شد؛ لطفاً دوباره امتحان کنید." }).expect(201);

    const detail = await a.client.get(`${base}/${t.id}`).expect(200);
    expect(detail.body.status).toBe("ANSWERED");
    expect(detail.body.messages).toHaveLength(2);
    expect(detail.body.messages[1].fromStaff).toBe(true);
    expect(detail.body.messages[1].authorName).toBe("پشتیبانی");

    await a.client.post(`${base}/${t.id}/messages`, { body: "درست شد، ممنون." }).expect(201);
    expect((await a.client.get(`${base}/${t.id}`).expect(200)).body.status).toBe("OPEN");
    await a.client.post(`${base}/${t.id}/close`).expect(200);
    expect((await a.client.get(`${base}/${t.id}`).expect(200)).body.status).toBe("CLOSED");
    // Writing again reopens the conversation.
    await a.client.post(`${base}/${t.id}/messages`, { body: "باز هم مشکل دارم." }).expect(201);
    expect((await a.client.get(`${base}/${t.id}`).expect(200)).body.status).toBe("OPEN");

    const customer = await registerUser(app);
    await customer.client.get("/admin/tickets").expect(403);
  });

  it("serves public settings, lets only SUPER_ADMIN change them, and closes registration", async () => {
    const anon = await new Client(app).init();
    const pub = await anon.get("/settings").expect(200);
    expect(pub.body).toHaveProperty("registrationEnabled");

    const support = await staff("SUPPORT");
    await support.client.put("/admin/settings", { registrationEnabled: false, announcement: "", supportEmail: "" }).expect(403);

    const admin = await staff("SUPER_ADMIN");
    await admin.client
      .put("/admin/settings", { registrationEnabled: false, announcement: "به‌روزرسانی امشب ساعت ۲۳", supportEmail: "help@example.test" })
      .expect(200);
    try {
      // The settings cache lives five seconds; a fresh app reads straight from the database.
      const fresh = await createTestApp();
      try {
        const c = await new Client(fresh).init();
        expect((await c.get("/settings").expect(200)).body.announcement).toBe("به‌روزرسانی امشب ساعت ۲۳");
        const res = await c
          .post("/auth/register", { fullName: "کاربر", email: `closed-${Date.now()}@example.test`, password: PASSWORD, organizationName: "فروشگاه بسته", acceptTerms: true })
          .expect(403);
        expect(res.body.code).toBe("FORBIDDEN");
      } finally {
        await fresh.close();
      }
    } finally {
      await admin.client.put("/admin/settings", { registrationEnabled: true, announcement: "", supportEmail: "" }).expect(200);
    }
  });

  it("lets admins stop a campaign and see provider status, but not SUPPORT", async () => {
    const owner = await registerUser(app);
    const org = `/organizations/${owner.orgId}`;
    const { body: account } = await owner.client.post(`${org}/messaging-accounts/mock`, { displayName: "آزمایشی" }).expect(201);
    const { body: contact } = await owner.client.post(`${org}/contacts`, { baleChatId: "7001", consent: "OPTED_IN" }).expect(201);
    const { body: list } = await owner.client.post(`${org}/lists`, { name: "گروه" }).expect(201);
    await owner.client.post(`${org}/lists/${list.id}/members`, { contactIds: [contact.id] }).expect(201);
    const { body: campaign } = await owner.client
      .post(`${org}/campaigns`, { name: "تخفیف", messageText: "سلام", messagingAccountId: account.id, listId: list.id })
      .expect(201);

    const support = await staff("SUPPORT");
    await support.client.get("/admin/providers").expect(200);
    await support.client.post(`/admin/campaigns/${campaign.id}/stop`, { reason: "گزارش هرزنامه" }).expect(403);

    const admin = await staff("SUPER_ADMIN");
    const listed = await admin.client.get(`/admin/campaigns?q=${encodeURIComponent("تخفیف")}`).expect(200);
    expect(listed.body.items.some((c: { id: string }) => c.id === campaign.id)).toBe(true);
    await admin.client.post(`/admin/campaigns/${campaign.id}/stop`, { reason: "گزارش هرزنامه" }).expect(200);
    const after = await owner.client.get(`${org}/campaigns/${campaign.id}`).expect(200);
    expect(after.body.status).toBe("CANCELLED");
    await admin.client.post(`/admin/campaigns/${campaign.id}/stop`, { reason: "دوباره" }).expect(409);

    const providers = await admin.client.get("/admin/providers").expect(200);
    expect(JSON.stringify(providers.body)).not.toMatch(/token/i);
  });

  it("enrolls TOTP, requires it at login, consumes recovery codes once, and disables it", async () => {
    const u = await registerUser(app);
    const { body: setup } = await u.client.post("/auth/mfa/setup").expect(200);
    expect(setup.otpauthUri).toContain("otpauth://totp/");
    await u.client.post("/auth/mfa/confirm", { code: "000000" }).expect(400);
    const { body: confirmed } = await u.client.post("/auth/mfa/confirm", { code: currentCode(setup.secret) }).expect(200);
    expect(confirmed.recoveryCodes).toHaveLength(10);
    expect((await u.client.get("/auth/me").expect(200)).body.user.mfaEnabled).toBe(true);
    const row = await prisma(app).user.findUniqueOrThrow({ where: { id: u.userId } });
    expect(row.totpSecretEncrypted).not.toContain(setup.secret);

    const c = await new Client(app).init();
    const step1 = await c.post("/auth/login", { email: u.email, password: PASSWORD }).expect(200);
    expect(step1.body.mfaRequired).toBe(true);
    await c.get("/auth/me").expect(401);
    await c.post("/auth/login/mfa", { mfaToken: step1.body.mfaToken, code: "123456" }).expect(400);
    await c.post("/auth/login/mfa", { mfaToken: step1.body.mfaToken, code: confirmed.recoveryCodes[0] }).expect(200);
    await c.get("/auth/me").expect(200);

    // A used recovery code and a used challenge token do not work twice.
    const c2 = await new Client(app).init();
    const again = await c2.post("/auth/login", { email: u.email, password: PASSWORD }).expect(200);
    await c2.post("/auth/login/mfa", { mfaToken: again.body.mfaToken, code: confirmed.recoveryCodes[0] }).expect(400);
    await c2.post("/auth/login/mfa", { mfaToken: step1.body.mfaToken, code: confirmed.recoveryCodes[1] }).expect(401);

    await u.client.post("/auth/mfa/disable", { password: "wrong-password-1", code: confirmed.recoveryCodes[2] }).expect(400);
    await u.client.post("/auth/mfa/disable", { password: PASSWORD, code: confirmed.recoveryCodes[2] }).expect(204);
    const c3 = await new Client(app).init();
    const plain = await c3.post("/auth/login", { email: u.email, password: PASSWORD }).expect(200);
    expect(plain.body.user.id).toBe(u.userId);
  });

  it("blocks the admin panel for staff without 2FA when ADMIN_MFA_REQUIRED is on", async () => {
    const strict = await createTestApp({ ADMIN_MFA_REQUIRED: "true" });
    try {
      const s = await registerUser(strict);
      await prisma(strict).user.update({ where: { id: s.userId }, data: { platformRole: "SUPER_ADMIN" } });
      const res = await s.client.get("/admin/stats").expect(403);
      expect(res.body.code).toBe("MFA_REQUIRED");
      // The account page (outside the admin panel) still works so they can enroll.
      await s.client.post("/auth/mfa/setup").expect(200);
    } finally {
      await strict.close();
    }
  });
});
