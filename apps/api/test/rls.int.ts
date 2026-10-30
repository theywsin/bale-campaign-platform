import type { INestApplication } from "@nestjs/common";
import { PrismaService } from "../src/prisma/prisma.service";
import { tenantStorage } from "../src/prisma/tenant-context";
import { createTestApp, registerUser } from "./helpers";

/**
 * Row-level security is the second isolation layer: even a query that forgets its
 * organization filter must not see or write another tenant's rows.
 */
describe("row-level security", () => {
  let app: INestApplication;
  let db: PrismaService;
  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  it("hides and protects other organizations' rows inside a tenant context", async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    await a.client.post(`/organizations/${a.orgId}/contacts`, { baleChatId: "9101" }).expect(201);
    const { body: bc } = await b.client.post(`/organizations/${b.orgId}/contacts`, { baleChatId: "9102" }).expect(201);

    await tenantStorage.run({ orgId: a.orgId }, async () => {
      // Deliberately unscoped: the database still returns only A's rows.
      const all = await db.client.contact.findMany({ select: { organizationId: true } });
      expect(all.length).toBeGreaterThan(0);
      expect(all.every((c) => c.organizationId === a.orgId)).toBe(true);
      expect(await db.client.contact.findUnique({ where: { id: bc.id } })).toBeNull();

      // Writes into B are refused, and updates of B's rows touch nothing.
      await expect(db.client.contact.create({ data: { organizationId: b.orgId, baleChatId: "9199" } })).rejects.toThrow();
      const upd = await db.client.contact.updateMany({ where: { id: bc.id }, data: { firstName: "x" } });
      expect(upd.count).toBe(0);

      // The same holds inside interactive transactions.
      const inTx = await db.client.$transaction((tx) => tx.contact.count({ where: { id: bc.id } }));
      expect(inTx).toBe(0);
    });

    // Without a tenant context (background services, platform admin) every row is visible.
    expect(await db.client.contact.findUnique({ where: { id: bc.id } })).not.toBeNull();
    const fresh = await db.base.contact.findUnique({ where: { id: bc.id }, select: { firstName: true } });
    expect(fresh?.firstName).toBeNull();
  });

  it("runs organization requests as the restricted role", async () => {
    await tenantStorage.run({ orgId: "00000000-0000-0000-0000-000000000000" }, async () => {
      const [row] = await db.client.$queryRaw<{ role: string; org: string }[]>`SELECT current_user AS role, current_setting('app.org_id', true) AS org`;
      expect(row).toEqual({ role: "bcp_app", org: "00000000-0000-0000-0000-000000000000" });
    });
    const [outside] = await db.client.$queryRaw<{ org: string | null }[]>`SELECT NULLIF(current_setting('app.org_id', true), '') AS org`;
    expect(outside?.org).toBeNull();
  });
});
