import type { INestApplication } from "@nestjs/common";
import { Client, createTestApp, lastEmailToken, PASSWORD, prisma, registerUser, uniqueEmail } from "./helpers";

describe("authentication", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("registers a user with an owned workspace and a session cookie", async () => {
    const client = await new Client(app).init();
    const email = uniqueEmail();
    const res = await client
      .post("/auth/register", { fullName: "مریم رضایی", email: email.toUpperCase(), password: PASSWORD, organizationName: "فروشگاه مریم", acceptTerms: true })
      .expect(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.organizations).toHaveLength(1);
    expect(res.body.organizations[0].role).toBe("ORGANIZATION_OWNER");
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/bcp_session=[^;]+; .*HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);

    const me = await client.get("/auth/me").expect(200);
    expect(me.body.user.id).toBe(res.body.user.id);
  });

  it("stores only an Argon2id hash of the password", async () => {
    const { userId } = await registerUser(app);
    const user = await prisma(app).user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);
  });

  it("rejects a duplicate e-mail and invalid input with Persian field errors", async () => {
    const { email } = await registerUser(app);
    const client = await new Client(app).init();
    const dup = await client.post("/auth/register", { fullName: "تکراری", email, password: PASSWORD, organizationName: "x y", acceptTerms: true }).expect(409);
    expect(dup.body.code).toBe("CONFLICT");

    const bad = await client.post("/auth/register", { fullName: "a", email: "nope", password: "short", organizationName: "", acceptTerms: false }).expect(400);
    expect(bad.body.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(bad.body.fieldErrors)).toEqual(expect.arrayContaining(["fullName", "email", "password", "organizationName", "acceptTerms"]));
  });

  it("logs in, logs out, and rejects wrong credentials without revealing which part was wrong", async () => {
    const { email } = await registerUser(app);
    const client = await new Client(app).init();
    const wrong = await client.post("/auth/login", { email, password: "WrongPassw0rd" }).expect(401);
    const unknown = await client.post("/auth/login", { email: uniqueEmail(), password: "WrongPassw0rd" }).expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);

    await client.post("/auth/login", { email, password: PASSWORD }).expect(200);
    await client.get("/auth/me").expect(200);
    await client.post("/auth/logout").expect(204);
    await client.get("/auth/me").expect(401);
  });

  it("requires a session for protected routes", async () => {
    const client = await new Client(app).init();
    const res = await client.get("/auth/me").expect(401);
    expect(res.body.code).toBe("UNAUTHENTICATED");
  });

  it("resets a password with a single-use token and revokes existing sessions", async () => {
    const { client: oldDevice, email } = await registerUser(app);
    const anon = await new Client(app).init();
    const forgot = await anon.post("/auth/password/forgot", { email }).expect(202);
    // Same answer for unknown accounts (no enumeration).
    const forgotUnknown = await anon.post("/auth/password/forgot", { email: uniqueEmail() }).expect(202);
    expect(forgotUnknown.body).toEqual(forgot.body);

    const token = await lastEmailToken(app, email, "password-reset");
    await anon.post("/auth/password/reset", { token, password: "N3wPasswordValue" }).expect(204);
    const reused = await anon.post("/auth/password/reset", { token, password: "An0therPassword" }).expect(400);
    expect(reused.body.code).toBe("TOKEN_INVALID");

    await oldDevice.get("/auth/me").expect(401);
    await anon.post("/auth/login", { email, password: PASSWORD }).expect(401);
    await anon.post("/auth/login", { email, password: "N3wPasswordValue" }).expect(200);
  });

  it("changes the password, keeps the current device signed in and signs out others", async () => {
    const { client, email } = await registerUser(app);
    const other = await new Client(app).init();
    await other.post("/auth/login", { email, password: PASSWORD }).expect(200);

    await client.post("/users/me/password", { currentPassword: "WrongPassw0rd", newPassword: "N3wPasswordValue" }).expect(400);
    await client.post("/users/me/password", { currentPassword: PASSWORD, newPassword: "N3wPasswordValue" }).expect(204);
    await client.get("/auth/me").expect(200);
    await other.get("/auth/me").expect(401);
  });

  it("lists and revokes sessions only for the owner", async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const sessionsB = await b.client.get("/users/me/sessions").expect(200);
    const bSessionId = sessionsB.body[0].id;
    expect(sessionsB.body[0].current).toBe(true);
    // A cannot revoke B's session.
    await a.client.delete(`/users/me/sessions/${bSessionId}`).expect(404);
    await b.client.get("/auth/me").expect(200);
  });

  it("verifies e-mail with the queued token", async () => {
    const { client, email } = await registerUser(app);
    const token = await lastEmailToken(app, email, "email-verification");
    await client.post("/auth/email/verify", { token }).expect(204);
    const me = await client.get("/auth/me").expect(200);
    expect(me.body.user.emailVerified).toBe(true);
  });

  it("records security events in the audit log", async () => {
    const { userId, email } = await registerUser(app);
    const client = await new Client(app).init();
    await client.post("/auth/login", { email, password: "WrongPassw0rd" }).expect(401);
    const actions = (await prisma(app).auditLog.findMany({ where: { actorUserId: userId } })).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["auth.register", "org.created", "auth.login.failed"]));
  });
});
