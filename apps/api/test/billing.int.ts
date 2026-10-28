import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { cancelStaleOrders, expireSubscriptions } from "@bcp/engine";
import { BillingService } from "../src/billing/billing.service";
import { MockPaymentGateway } from "../src/billing/payment-gateway";
import { addMember, createTestApp, prisma, registerUser, uniqueEmail, type Registered } from "./helpers";

const DAY = 24 * 3600 * 1000;
const RUN = Date.now().toString(36);

describe("billing: plans, checkout, webhooks, licenses and limits", () => {
  let app: INestApplication;
  let admin: Registered;
  let gateway: MockPaymentGateway;

  beforeAll(async () => {
    app = await createTestApp();
    gateway = app.get(BillingService).gateway!;
    admin = await registerUser(app);
    await prisma(app).user.update({ where: { id: admin.userId }, data: { platformRole: "SUPER_ADMIN" } });
  });
  afterAll(async () => {
    await app.close();
  });

  let seq = 0;
  async function createPlan(over: Record<string, unknown> = {}) {
    const res = await admin.client
      .post("/admin/plans", { code: `t-${Date.now()}-${seq++}`, name: "پلن تست", priceRials: 1_500_000, periodDays: 30, ...over })
      .expect(201);
    return res.body as { id: string; code: string; priceRials: string };
  }

  const webhook = (body: object, signature: string) =>
    request(app.getHttpServer()).post("/api/v1/payments/webhooks/mock").set("X-Mock-Signature", signature).send(body);

  it("only staff with the right permission manage plans; SUPPORT cannot see revenue", async () => {
    const customer = await registerUser(app);
    await customer.client.post("/admin/plans", { code: "x-1", name: "نام", priceRials: 1, periodDays: 1 }).expect(403);
    await customer.client.get("/admin/orders").expect(403);
    const support = await registerUser(app);
    await prisma(app).user.update({ where: { id: support.userId }, data: { platformRole: "SUPPORT" } });
    // Fresh login so the session picks up the role.
    await support.client.get("/admin/plans").expect(200);
    await support.client.post("/admin/plans", { code: "x-2", name: "نام", priceRials: 1, periodDays: 1 }).expect(403);
    await support.client.get("/admin/orders").expect(403);
    await support.client.get("/admin/webhook-events").expect(403);
    const stats = await support.client.get("/admin/billing/stats").expect(200);
    expect(stats.body.revenue30dRials).toBeNull();

    const plan = await createPlan();
    await admin.client.post("/admin/plans", { code: plan.code, name: "تکراری", priceRials: 1, periodDays: 1 }).expect(409);
    await admin.client.post("/admin/plans", { code: "neg-1", name: "منفی", priceRials: -5, periodDays: 1 }).expect(400);
  });

  it("paid checkout: signed callback activates the plan exactly once", async () => {
    const plan = await createPlan({ maxContacts: 1000 });
    const u = await registerUser(app);
    const org = `/organizations/${u.orgId}/billing`;

    const before = await u.client.get(org).expect(200);
    expect(before.body.subscription).toBeNull();
    expect(before.body.paymentsTestOnly).toBe(true);
    expect(before.body.plans.some((p: { id: string }) => p.id === plan.id)).toBe(true);

    const { body: checkout } = await u.client.post(`${org}/checkout`, { planId: plan.id }).expect(201);
    expect(checkout.order).toMatchObject({ status: "PENDING", amountRials: "1500000", paymentStatus: "INITIATED" });
    expect(checkout.redirectUrl).toMatch(/^\/billing\/mock-checkout\/[0-9a-f-]{36}$/);
    const paymentId = checkout.redirectUrl.split("/").pop();
    const payment = await prisma(app).payment.findUniqueOrThrow({ where: { id: paymentId } });

    // Bad signature, tampered amount: rejected, nothing recorded.
    const event = { eventId: `evt_paid_once_1_${RUN}`, providerRef: payment.providerRef, outcome: "SUCCEEDED", amountRials: "1500000" };
    await webhook(event, "0".repeat(64)).expect(401);
    await webhook({ ...event, amountRials: "1" }, gateway.sign(event as never)).expect(401);
    expect(await prisma(app).webhookEvent.count({ where: { eventId: event.eventId } })).toBe(0);

    const sig = gateway.sign(event as never);
    const first = await webhook(event, sig).expect(200);
    expect(first.body.status).toBe("processed");
    const again = await webhook(event, sig).expect(200);
    expect(again.body.status).toBe("duplicate");
    // A different event claiming failure after success cannot flip the result.
    const late = { ...event, eventId: `evt_paid_once_2_${RUN}`, outcome: "FAILED" };
    expect((await webhook(late, gateway.sign(late as never)).expect(200)).body.status).toBe("ignored");

    const after = await u.client.get(org).expect(200);
    expect(after.body.subscription).toMatchObject({ status: "ACTIVE", source: "PAYMENT", plan: { id: plan.id } });
    expect(after.body.limits.maxContacts).toBe(1000);
    expect(after.body.orders[0]).toMatchObject({ status: "PAID", paymentStatus: "SUCCEEDED" });
    const subs = await prisma(app).subscription.findMany({ where: { organizationId: u.orgId } });
    expect(subs).toHaveLength(1);
    const history = await prisma(app).paymentStatusHistory.findMany({ where: { paymentId }, orderBy: { createdAt: "asc" } });
    expect(history.map((h) => h.toStatus)).toEqual(["INITIATED", "SUCCEEDED"]);

    // Buying the same plan again extends the running period.
    const endsAt = new Date(after.body.subscription.endsAt).getTime();
    const { body: renew } = await u.client.post(`${org}/checkout`, { planId: plan.id }).expect(201);
    await u.client.post(`/payments/mock/${renew.redirectUrl.split("/").pop()}/complete`, { outcome: "SUCCEEDED" }).expect(200);
    const renewed = await u.client.get(org).expect(200);
    expect(new Date(renewed.body.subscription.endsAt).getTime()).toBe(endsAt + 30 * DAY);
    expect(renewed.body.subscription.id).toBe(after.body.subscription.id);
  });

  it("mock checkout: only billing members of the org can pay; failure leaves no subscription", async () => {
    const plan = await createPlan();
    const u = await registerUser(app);
    const { body } = await u.client.post(`/organizations/${u.orgId}/billing/checkout`, { planId: plan.id }).expect(201);
    const paymentId = body.redirectUrl.split("/").pop();

    const stranger = await registerUser(app);
    await stranger.client.get(`/payments/mock/${paymentId}`).expect(404);
    await stranger.client.post(`/payments/mock/${paymentId}/complete`, { outcome: "SUCCEEDED" }).expect(404);
    const member = await registerUser(app);
    await addMember(app, u.orgId, member.userId, "ORGANIZATION_ADMIN");
    await member.client.get(`/payments/mock/${paymentId}`).expect(404); // admins lack billing:write
    await member.client.post(`/organizations/${u.orgId}/billing/checkout`, { planId: plan.id }).expect(403);

    const info = await u.client.get(`/payments/mock/${paymentId}`).expect(200);
    expect(info.body).toMatchObject({ status: "INITIATED", amountRials: "1500000", testOnly: true });
    const done = await u.client.post(`/payments/mock/${paymentId}/complete`, { outcome: "FAILED" }).expect(200);
    expect(done.body.status).toBe("FAILED");
    // Retrying a final payment is ignored.
    await u.client.post(`/payments/mock/${paymentId}/complete`, { outcome: "SUCCEEDED" }).expect(200);
    const overview = await u.client.get(`/organizations/${u.orgId}/billing`).expect(200);
    expect(overview.body.subscription).toBeNull();
    expect(overview.body.orders[0]).toMatchObject({ status: "FAILED", paymentStatus: "FAILED" });
  });

  it("without a gateway, paid checkout is refused and nothing is created", async () => {
    const noPay = await createTestApp({ PAYMENTS_MOCK_ENABLED: "false" });
    try {
      const plan = await createPlan();
      const u = await registerUser(noPay);
      await u.client.post(`/organizations/${u.orgId}/billing/checkout`, { planId: plan.id }).expect(503);
      expect(await prisma(noPay).order.count({ where: { organizationId: u.orgId } })).toBe(0);
      await request(noPay.getHttpServer()).post("/api/v1/payments/webhooks/mock").send({}).expect(404);
    } finally {
      await noPay.close();
    }
  });

  it("licenses: shown once, stored hashed, redeemed once, revocable", async () => {
    const plan = await createPlan({ maxMembers: 3 });
    const { body } = await admin.client.post("/admin/licenses", { planId: plan.id, periodDays: 90, count: 2, note: "فروش حضوری" }).expect(201);
    expect(body.keys).toHaveLength(2);
    const [key1, key2] = body.keys as string[];
    expect(key1).toMatch(/^BCP(-[0-9A-Z]{4}){4}$/);
    const stored = await prisma(app).license.findMany({ where: { planId: plan.id } });
    expect(stored.every((l) => !JSON.stringify(l).includes(key1!.slice(4)))).toBe(true);
    const list = await admin.client.get("/admin/licenses").expect(200);
    expect(JSON.stringify(list.body)).not.toContain("keyHash");

    const a = await registerUser(app);
    const b = await registerUser(app);
    const sub = await a.client.post(`/organizations/${a.orgId}/billing/redeem-license`, { key: key1!.toLowerCase() }).expect(200);
    expect(sub.body).toMatchObject({ source: "LICENSE", plan: { id: plan.id } });
    const days = (new Date(sub.body.endsAt).getTime() - new Date(sub.body.startsAt).getTime()) / DAY;
    expect(Math.round(days)).toBe(90);
    await b.client.post(`/organizations/${b.orgId}/billing/redeem-license`, { key: key1 }).expect(404);
    await b.client.post(`/organizations/${b.orgId}/billing/redeem-license`, { key: "BCP-0000-0000-0000-0000" }).expect(404);

    const l2 = stored.find((l) => l.keyPrefix === key2!.slice(0, 8))!;
    await admin.client.post(`/admin/licenses/${l2.id}/revoke`).expect(200);
    await b.client.post(`/organizations/${b.orgId}/billing/redeem-license`, { key: key2 }).expect(404);
    const usedId = stored.find((l) => l.keyPrefix === key1!.slice(0, 8))!.id;
    await admin.client.post(`/admin/licenses/${usedId}/revoke`).expect(409);
  });

  it("enforces plan limits on contacts, accounts, members and monthly messages", async () => {
    const plan = await createPlan({ priceRials: 0, maxContacts: 3, maxMessagingAccounts: 1, maxMembers: 2, maxMonthlyMessages: 2 });
    const u = await registerUser(app);
    const org = `/organizations/${u.orgId}`;
    // Free plan: activated without payment.
    const { body: free } = await u.client.post(`${org}/billing/checkout`, { planId: plan.id }).expect(201);
    expect(free).toMatchObject({ redirectUrl: null, order: { status: "PAID", amountRials: "0" } });

    const { body: account } = await u.client.post(`${org}/messaging-accounts/mock`, { displayName: "حساب یک" }).expect(201);
    const second = await u.client.post(`${org}/messaging-accounts/mock`, { displayName: "حساب دو" }).expect(403);
    expect(second.body.code).toBe("PLAN_LIMIT_REACHED");

    for (const chat of ["7001", "7002", "7003"]) await u.client.post(`${org}/contacts`, { baleChatId: chat }).expect(201);
    expect((await u.client.post(`${org}/contacts`, { baleChatId: "7004" }).expect(403)).body.code).toBe("PLAN_LIMIT_REACHED");
    await u.client.upload(`${org}/contacts/import`, "file", "bale_chat_id\n7005\n", "c.csv").expect(403);

    await u.client.post(`${org}/invitations`, { email: uniqueEmail("inv"), role: "ORGANIZATION_MEMBER" }).expect(201);
    expect((await u.client.post(`${org}/invitations`, { email: uniqueEmail("inv"), role: "ORGANIZATION_MEMBER" }).expect(403)).body.code).toBe("PLAN_LIMIT_REACHED");

    // 3 sendable recipients > 2 monthly messages: the start is rolled back.
    const { body: c } = await u.client.post(`${org}/campaigns`, { name: "کمپین سقف", messageText: "سلام", messagingAccountId: account.id }).expect(201);
    expect((await u.client.post(`${org}/campaigns/${c.id}/start`, {}).expect(403)).body.code).toBe("PLAN_LIMIT_REACHED");
    const after = await u.client.get(`${org}/campaigns/${c.id}`).expect(200);
    expect(after.body).toMatchObject({ status: "DRAFT", totalRecipients: 0 });
    const usage = (await u.client.get(`${org}/billing`).expect(200)).body;
    expect(usage.usage).toMatchObject({ maxContacts: 3, maxMessagingAccounts: 1, maxMembers: 2, maxMonthlyMessages: 0 });
  });

  it("default plan applies without a subscription; expiry and stale orders are swept", async () => {
    const plan = await createPlan({ isDefault: true, maxContacts: 0 });
    try {
      const u = await registerUser(app);
      const res = await u.client.post(`/organizations/${u.orgId}/contacts`, { baleChatId: "8001" }).expect(403);
      expect(res.body.code).toBe("PLAN_LIMIT_REACHED");
      // Only one default plan at a time.
      const other = await createPlan({ isDefault: true });
      expect((await prisma(app).plan.findUniqueOrThrow({ where: { id: plan.id } })).isDefault).toBe(false);
      await prisma(app).plan.update({ where: { id: other.id }, data: { isDefault: false } });
    } finally {
      await prisma(app).plan.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }

    const u = await registerUser(app);
    const paid = await createPlan({ maxContacts: 5 });
    await admin.client.post(`/admin/organizations/${u.orgId}/subscription`, { planId: paid.id, periodDays: 10 }).expect(201);
    expect((await u.client.get(`/organizations/${u.orgId}/billing`).expect(200)).body.limits.maxContacts).toBe(5);
    expect(await expireSubscriptions(prisma(app), new Date(Date.now() + 11 * DAY))).toBeGreaterThanOrEqual(1);
    const ov = (await u.client.get(`/organizations/${u.orgId}/billing`).expect(200)).body;
    expect(ov.subscription).toBeNull();
    expect(ov.limits.maxContacts).toBeNull();

    const { body } = await u.client.post(`/organizations/${u.orgId}/billing/checkout`, { planId: paid.id }).expect(201);
    expect(await cancelStaleOrders(prisma(app), new Date(Date.now() + 25 * 3600 * 1000))).toBeGreaterThanOrEqual(1);
    const order = await prisma(app).order.findUniqueOrThrow({ where: { id: body.order.id }, include: { payments: true } });
    expect(order.status).toBe("CANCELED");
    expect(order.payments[0]!.status).toBe("CANCELED");
    // A late success callback for the canceled payment does not activate anything.
    const p = order.payments[0]!;
    const ev = { eventId: `evt_late_after_cancel_${RUN}`, providerRef: p.providerRef, outcome: "SUCCEEDED", amountRials: p.amountRials.toString() };
    expect((await webhook(ev, gateway.sign(ev as never)).expect(200)).body.status).toBe("ignored");
    expect((await u.client.get(`/organizations/${u.orgId}/billing`).expect(200)).body.subscription).toBeNull();
  });

  it("plan updates change only the fields sent; a tampered amount fails the payment", async () => {
    const plan = await createPlan({ maxContacts: 7, isPublic: false });
    const { body: updated } = await admin.client.patch(`/admin/plans/${plan.id}`, { name: "نام تازه" }).expect(200);
    expect(updated).toMatchObject({ name: "نام تازه", maxContacts: 7, isPublic: false, isActive: true });
    await admin.client.patch(`/admin/plans/${plan.id}`, { isPublic: true }).expect(200);

    const u = await registerUser(app);
    const { body } = await u.client.post(`/organizations/${u.orgId}/billing/checkout`, { planId: plan.id }).expect(201);
    const payment = await prisma(app).payment.findUniqueOrThrow({ where: { id: body.redirectUrl.split("/").pop() } });
    // Correctly signed, but for a different amount than the order: never activates.
    const ev = { eventId: `evt_amount_${RUN}`, providerRef: payment.providerRef, outcome: "SUCCEEDED", amountRials: "1" };
    expect((await webhook(ev, gateway.sign(ev as never)).expect(200)).body.status).toBe("processed");
    const after = await prisma(app).payment.findUniqueOrThrow({ where: { id: payment.id }, include: { order: true } });
    expect(after).toMatchObject({ status: "FAILED", failureCode: "amount_mismatch", order: { status: "FAILED" } });
    expect(await prisma(app).subscription.count({ where: { organizationId: u.orgId } })).toBe(0);
  });

  it("admin order list masks gateway references for roles without sensitive access", async () => {
    const billingAdmin = await registerUser(app);
    await prisma(app).user.update({ where: { id: billingAdmin.userId }, data: { platformRole: "ADMIN" } });
    const res = await billingAdmin.client.get("/admin/orders").expect(200);
    for (const o of res.body.items) for (const p of o.payments) expect(p.providerRef).toMatch(/^••••/);
    const full = await admin.client.get("/admin/orders").expect(200);
    expect(full.body.items.some((o: { payments: { providerRef: string }[] }) => o.payments.some((p) => p.providerRef.startsWith("mock_")))).toBe(true);
  });
});
