import type { INestApplication } from "@nestjs/common";
import { addMember, createTestApp, prisma, registerUser } from "./helpers";

describe("contacts, lists, suppression and CSV", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("creates a contact with a normalized phone and rejects duplicates and empty addresses", async () => {
    const a = await registerUser(app);
    const base = `/organizations/${a.orgId}/contacts`;
    const res = await a.client.post(base, { firstName: "سارا", phone: "۰۹۱۲ ۱۲۳ ۴۵۶۷", consent: "OPTED_IN" }).expect(201);
    expect(res.body.phone).toBe("+989121234567");
    expect(res.body.consent).toBe("OPTED_IN");

    const dup = await a.client.post(base, { phone: "09121234567" }).expect(409);
    expect(dup.body.code).toBe("CONFLICT");
    const empty = await a.client.post(base, { firstName: "بی‌آدرس" }).expect(400);
    expect(empty.body.fieldErrors.phone).toBeDefined();
    await a.client.post(base, { phone: "12345" }).expect(400);

    const list = await a.client.get(`${base}?q=سارا`).expect(200);
    expect(list.body.total).toBe(1);
  });

  it("archives, restores and deletes a contact", async () => {
    const a = await registerUser(app);
    const base = `/organizations/${a.orgId}/contacts`;
    const { body: c } = await a.client.post(base, { baleChatId: "1001" }).expect(201);
    await a.client.put(`${base}/${c.id}/archived`, { archived: true }).expect(200);
    expect((await a.client.get(base).expect(200)).body.total).toBe(0);
    expect((await a.client.get(`${base}?status=ARCHIVED`).expect(200)).body.total).toBe(1);
    await a.client.put(`${base}/${c.id}/archived`, { archived: false }).expect(200);
    await a.client.delete(`${base}/${c.id}`).expect(204);
    await a.client.get(`${base}/${c.id}`).expect(404);
  });

  it("isolates contacts between organizations", async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const { body: c } = await a.client.post(`/organizations/${a.orgId}/contacts`, { baleChatId: "2002" }).expect(201);
    await b.client.get(`/organizations/${a.orgId}/contacts`).expect(404);
    await b.client.get(`/organizations/${a.orgId}/contacts/${c.id}`).expect(404);
    // B's own organization path with A's contact id
    await b.client.get(`/organizations/${b.orgId}/contacts/${c.id}`).expect(404);
    await b.client.patch(`/organizations/${b.orgId}/contacts/${c.id}`, { firstName: "x" }).expect(404);
    await b.client.delete(`/organizations/${b.orgId}/contacts/${c.id}`).expect(404);
    // Adding A's contact to B's list is refused.
    const { body: list } = await b.client.post(`/organizations/${b.orgId}/lists`, { name: "فهرست" }).expect(201);
    await b.client.post(`/organizations/${b.orgId}/lists/${list.id}/members`, { contactIds: [c.id] }).expect(404);
    // The same phone may exist in two organizations.
    await b.client.post(`/organizations/${b.orgId}/contacts`, { baleChatId: "2002" }).expect(201);
  });

  it("imports CSV with a row report, adds to a list, and exports without formula injection", async () => {
    const a = await registerUser(app);
    const org = `/organizations/${a.orgId}`;
    const { body: list } = await a.client.post(`${org}/lists`, { name: "مشتریان" }).expect(201);
    await a.client.post(`${org}/contacts`, { firstName: "قدیمی", phone: "09120000001" }).expect(201);

    const csv = [
      "first_name,last_name,phone,bale_chat_id",
      "=HYPERLINK(\"http://evil\"),محمدی,09121111111,3001",
      "به‌روز,,09120000001,3002",
      "خطا,,0912,",
      "تکراری,,09121111111,",
      ",,,3003",
    ].join("\n");
    const imp = await a.client.upload(`${org}/contacts/import`, "file", csv, "contacts.csv", { listId: list.id });
    expect(imp.status).toBe(201);
    expect(imp.body).toMatchObject({ totalRows: 5, createdCount: 2, updatedCount: 1, invalidCount: 2 });
    expect(imp.body.errors.map((e: { row: number }) => e.row)).toEqual([4, 5]);

    const lists = await a.client.get(`${org}/lists`).expect(200);
    expect(lists.body[0].contactCount).toBe(3);
    const updated = await a.client.get(`${org}/contacts?q=به‌روز`).expect(200);
    expect(updated.body.items[0]).toMatchObject({ phone: "+989120000001", baleChatId: "3002" });

    const exp = await a.client.get(`${org}/contacts/export`).expect(200);
    expect(exp.headers["content-type"]).toContain("text/csv");
    expect(exp.text).toContain("'=HYPERLINK");
    expect(exp.text).not.toMatch(/(^|,)=HYPERLINK/m);
    expect(exp.text).toContain("+989121111111");

    await a.client.upload(`${org}/contacts/import`, "file", "name,city\nx,y", "bad.csv").expect(400);
    await a.client.upload(`${org}/contacts/import`, "file", "phone\n09121111111", "bad.exe").expect(400);
    const big = "phone\n" + "0".repeat(3 * 1024 * 1024);
    await a.client.upload(`${org}/contacts/import`, "file", big, "big.csv").expect(413);
  });

  it("restricts export to admins and manages the suppression list", async () => {
    const owner = await registerUser(app);
    const member = await registerUser(app);
    await addMember(app, owner.orgId, member.userId, "ORGANIZATION_MEMBER");
    const org = `/organizations/${owner.orgId}`;
    await member.client.get(`${org}/contacts`).expect(200);
    await member.client.get(`${org}/contacts/export`).expect(403);

    const s = await owner.client.post(`${org}/suppressions`, { phone: "09125555555", reason: "درخواست مخاطب" }).expect(201);
    expect(s.body).toMatchObject({ kind: "PHONE", value: "+989125555555" });
    await owner.client.post(`${org}/suppressions`, { phone: "09125555555", baleChatId: "1" }).expect(400);
    expect((await owner.client.get(`${org}/suppressions`).expect(200)).body.total).toBe(1);
    await owner.client.delete(`${org}/suppressions/${s.body.id}`).expect(204);

    const audit = await prisma(app).auditLog.findMany({ where: { organizationId: owner.orgId }, select: { action: true } });
    expect(audit.map((x) => x.action)).toEqual(expect.arrayContaining(["suppression.added", "suppression.removed"]));
  });
});
