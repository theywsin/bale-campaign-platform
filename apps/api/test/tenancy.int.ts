import type { INestApplication } from "@nestjs/common";
import { Client, createTestApp, lastEmailToken, PASSWORD, registerUser, uniqueEmail } from "./helpers";

describe("multi-tenant access control", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("hides another organization entirely (404, not 403)", async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    for (const path of ["", "/members", "/invitations", "/activity"]) {
      const res = await b.client.get(`/organizations/${a.orgId}${path}`).expect(404);
      expect(res.body.code).toBe("NOT_FOUND");
    }
    await b.client.patch(`/organizations/${a.orgId}`, { name: "تصاحب" }).expect(404);
    await b.client.post(`/organizations/${a.orgId}/invitations`, { email: uniqueEmail(), role: "ORGANIZATION_ADMIN" }).expect(404);
    await b.client.get(`/organizations/not-a-uuid`).expect(404);
    // Own organization still works.
    await b.client.get(`/organizations/${b.orgId}`).expect(200);
  });

  it("cannot act on a member of another organization through its own orgId", async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const aMembers = await a.client.get(`/organizations/${a.orgId}/members`).expect(200);
    const aOwnerMemberId = aMembers.body[0].id;
    // B is owner of its own org but targets A's member id via B's org path.
    await b.client.delete(`/organizations/${b.orgId}/members/${aOwnerMemberId}`).expect(404);
    await b.client.patch(`/organizations/${b.orgId}/members/${aOwnerMemberId}`, { role: "ORGANIZATION_MEMBER" }).expect(404);
  });

  it("invites a member, enforces the invited e-mail, and applies role permissions", async () => {
    const owner = await registerUser(app);
    const inviteeEmail = uniqueEmail("invitee");
    await owner.client.post(`/organizations/${owner.orgId}/invitations`, { email: inviteeEmail, role: "ORGANIZATION_MEMBER" }).expect(201);
    // A second pending invitation for the same e-mail is rejected.
    await owner.client.post(`/organizations/${owner.orgId}/invitations`, { email: inviteeEmail, role: "ORGANIZATION_MEMBER" }).expect(409);
    const token = await lastEmailToken(app, inviteeEmail, "invitation");

    const stranger = await registerUser(app);
    await stranger.client.post("/organizations/invitations/accept", { token }).expect(403);

    const invitee = await registerUser(app, { email: inviteeEmail });
    const accepted = await invitee.client.post("/organizations/invitations/accept", { token }).expect(201);
    expect(accepted.body.id).toBe(owner.orgId);
    await invitee.client.post("/organizations/invitations/accept", { token }).expect(400);

    // A plain member can read but not manage.
    await invitee.client.get(`/organizations/${owner.orgId}`).expect(200);
    await invitee.client.get(`/organizations/${owner.orgId}/members`).expect(200);
    await invitee.client.patch(`/organizations/${owner.orgId}`, { name: "تغییر" }).expect(403);
    await invitee.client.post(`/organizations/${owner.orgId}/invitations`, { email: uniqueEmail(), role: "ORGANIZATION_MEMBER" }).expect(403);
    await invitee.client.get(`/organizations/${owner.orgId}/activity`).expect(403);
  });

  it("prevents privilege escalation by organization admins", async () => {
    const owner = await registerUser(app);
    const adminEmail = uniqueEmail("admin");
    await owner.client.post(`/organizations/${owner.orgId}/invitations`, { email: adminEmail, role: "ORGANIZATION_ADMIN" }).expect(201);
    const admin = await registerUser(app, { email: adminEmail });
    await admin.client.post("/organizations/invitations/accept", { token: await lastEmailToken(app, adminEmail, "invitation") }).expect(201);

    // Admin cannot invite an owner or demote/remove the owner.
    await admin.client.post(`/organizations/${owner.orgId}/invitations`, { email: uniqueEmail(), role: "ORGANIZATION_OWNER" }).expect(403);
    const members = (await admin.client.get(`/organizations/${owner.orgId}/members`).expect(200)).body as { id: string; role: string }[];
    const ownerMember = members.find((m) => m.role === "ORGANIZATION_OWNER")!;
    await admin.client.patch(`/organizations/${owner.orgId}/members/${ownerMember.id}`, { role: "ORGANIZATION_MEMBER" }).expect(403);
    await admin.client.delete(`/organizations/${owner.orgId}/members/${ownerMember.id}`).expect(403);
  });

  it("never leaves an organization without an owner", async () => {
    const owner = await registerUser(app);
    const members = (await owner.client.get(`/organizations/${owner.orgId}/members`).expect(200)).body as { id: string }[];
    const res = await owner.client.delete(`/organizations/${owner.orgId}/members/${members[0]!.id}`).expect(409);
    expect(res.body.code).toBe("CONFLICT");
  });

  it("creates additional workspaces owned by the creator", async () => {
    const user = await registerUser(app);
    const created = await user.client.post("/organizations", { name: "فضای دوم" }).expect(201);
    expect(created.body.role).toBe("ORGANIZATION_OWNER");
    const mine = await user.client.get("/organizations").expect(200);
    expect(mine.body.map((o: { id: string }) => o.id)).toEqual(expect.arrayContaining([user.orgId, created.body.id]));
  });

  it("signs in a member through the login form and lists only their organizations", async () => {
    const a = await registerUser(app);
    await registerUser(app);
    const client = await new Client(app).init();
    const res = await client.post("/auth/login", { email: a.email, password: PASSWORD }).expect(200);
    expect(res.body.organizations.map((o: { id: string }) => o.id)).toEqual([a.orgId]);
  });
});
