import type { INestApplication } from "@nestjs/common";
import { Client, createTestApp, PASSWORD, prisma, registerUser } from "./helpers";

describe("admin panel authorization", () => {
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

  it("rejects anonymous users and customers", async () => {
    const anon = await new Client(app).init();
    await anon.get("/admin/stats").expect(401);
    const customer = await registerUser(app);
    for (const path of ["/admin/stats", "/admin/users", "/admin/organizations", "/admin/audit-logs"]) {
      await customer.client.get(path).expect(403);
    }
  });

  it("lets SUPPORT read users but not change them or read the audit log", async () => {
    const support = await staff("SUPPORT");
    const target = await registerUser(app);
    await support.client.get("/admin/users").expect(200);
    await support.client.patch(`/admin/users/${target.userId}/status`, { status: "SUSPENDED" }).expect(403);
    await support.client.get("/admin/audit-logs").expect(403);
  });

  it("lets SUPER_ADMIN suspend a user, which ends their sessions and blocks login", async () => {
    const admin = await staff("SUPER_ADMIN");
    const target = await registerUser(app);
    await admin.client.patch(`/admin/users/${target.userId}/status`, { status: "SUSPENDED" }).expect(200);
    await target.client.get("/auth/me").expect(401);
    const again = await new Client(app).init();
    const res = await again.post("/auth/login", { email: target.email, password: PASSWORD }).expect(403);
    expect(res.body.code).toBe("ACCOUNT_SUSPENDED");
    await admin.client.patch(`/admin/users/${admin.userId}/status`, { status: "SUSPENDED" }).expect(403);

    const logs = await admin.client.get("/admin/audit-logs?q=admin.user.status_changed").expect(200);
    expect(logs.body.items.some((l: { targetId: string }) => l.targetId === target.userId)).toBe(true);
  });

  it("searches and paginates users", async () => {
    const admin = await staff("SUPER_ADMIN");
    const target = await registerUser(app);
    const res = await admin.client.get(`/admin/users?q=${encodeURIComponent(target.email)}&page=1&pageSize=5`).expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].id).toBe(target.userId);
    await admin.client.get("/admin/users?pageSize=1000").expect(400);
  });
});
