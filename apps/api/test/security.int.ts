import type { INestApplication } from "@nestjs/common";
import { RedisService } from "../src/redis/redis.module";
import { Client, createTestApp, ORIGIN, PASSWORD, registerUser, uniqueEmail } from "./helpers";

describe("security controls", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects state-changing requests without a matching CSRF token", async () => {
    const { client } = await registerUser(app);
    await client.agent.post("/api/v1/organizations").send({ name: "بدون توکن" }).expect(403);
    await client.agent.post("/api/v1/organizations").set("X-CSRF-Token", "x".repeat(43)).send({ name: "توکن غلط" }).expect(403);
    const res = await client.agent
      .post("/api/v1/organizations")
      .set("X-CSRF-Token", client.csrf)
      .set("Origin", "https://evil.example")
      .send({ name: "مبدأ غلط" })
      .expect(403);
    expect(res.body.code).toBe("CSRF_REJECTED");
    await client.post("/organizations", { name: "درست" }).expect(201);
  });

  it("locks login after repeated failures for the same e-mail", async () => {
    const { email } = await registerUser(app);
    const client = await new Client(app).init();
    for (let i = 0; i < 5; i++) await client.post("/auth/login", { email, password: "WrongPassw0rd" }).expect(401);
    const locked = await client.post("/auth/login", { email, password: PASSWORD }).expect(429);
    expect(locked.body.code).toBe("LOGIN_LOCKED");
  });

  it("never returns password hashes or session tokens in API bodies", async () => {
    const { client, orgId } = await registerUser(app);
    const admin = await registerUser(app);
    const { PrismaService } = await import("../src/prisma/prisma.service");
    await app.get(PrismaService).client.user.update({ where: { id: admin.userId }, data: { platformRole: "SUPER_ADMIN" } });
    const bodies = await Promise.all([
      client.get("/auth/me"),
      client.get("/users/me/sessions"),
      client.get(`/organizations/${orgId}/members`),
      admin.client.get("/admin/users"),
      admin.client.get("/admin/audit-logs"),
    ]);
    for (const res of bodies) {
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(/argon2|passwordHash|password_hash|tokenHash|token_hash/);
      expect(text).not.toContain(PASSWORD);
    }
  });

  it("treats malicious input as data", async () => {
    const { client } = await registerUser(app);
    const admin = await registerUser(app);
    const { PrismaService } = await import("../src/prisma/prisma.service");
    await app.get(PrismaService).client.user.update({ where: { id: admin.userId }, data: { platformRole: "SUPER_ADMIN" } });

    const sqli = await admin.client.get(`/admin/users?q=${encodeURIComponent("' OR 1=1; DROP TABLE users; --")}`).expect(200);
    expect(sqli.body.total).toBe(0);
    await client.post("/organizations", { name: "<img src=x onerror=alert(1)>" }).expect(400);
    await client.patch("/users/me", { fullName: "<script>alert(1)</script>" }).expect(400);
    // Unknown fields such as a self-assigned platform role are stripped by the schema.
    const me = await client.patch("/users/me", { fullName: "نام معتبر", platformRole: "SUPER_ADMIN" }).expect(200);
    expect(me.body.user.platformRole).toBeNull();
    await client.post("/organizations", ["not", "an", "object"]).expect(400);
    await client.delete("/users/me/sessions/not-a-uuid").expect(400);
  });

  it("rejects oversized request bodies", async () => {
    const { client } = await registerUser(app);
    const res = await client.post("/organizations", { name: "x".repeat(2 * 1024 * 1024) }).expect(413);
    expect(res.body.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("returns generic error bodies without stack traces", async () => {
    const client = await new Client(app).init();
    const res = await client.agent
      .post("/api/v1/auth/login")
      .set("X-CSRF-Token", client.csrf)
      .set("Origin", ORIGIN)
      .set("Content-Type", "application/json")
      .send("{not json")
      .expect(400);
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js|SyntaxError|stack/);
  });
});

describe("rate limiting", () => {
  let app: INestApplication;
  beforeAll(async () => {
    // Separate Redis DB so the counters (and blocks) do not affect other suites.
    app = await createTestApp({ AUTH_RATE_LIMIT_PER_MINUTE: "3", REDIS_URL: process.env.TEST_REDIS_RATE_URL ?? "redis://127.0.0.1:6379/14" });
    await app.get(RedisService).client.flushdb();
  });
  afterAll(async () => {
    await app.close();
  });

  it("throttles abuse-prone auth endpoints per client", async () => {
    const client = await new Client(app).init();
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      statuses.push((await client.post("/auth/password/forgot", { email: uniqueEmail() })).status);
    }
    expect(statuses.slice(0, 3)).toEqual([202, 202, 202]);
    expect(statuses.slice(3)).toEqual([429, 429]);
  });
});
