import type { INestApplication } from "@nestjs/common";
import { dispatchCampaign, providerResolver } from "@bcp/engine";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { RedisService } from "../src/redis/redis.module";
import { createTestApp, prisma, registerUser } from "./helpers";

// A local stand-in for the Bale Bot API (tapi.bale.ai is not reachable from CI/dev).
const TOKEN = "987654:fake_bale_token_for_tests";
const KEY = Buffer.alloc(32, 9).toString("base64");

describe("Bale bot accounts (against a local fake Bale API)", () => {
  let server: Server;
  let base = "";
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  let app: INestApplication;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = raw ? JSON.parse(raw) : {};
        const method = (req.url ?? "").split("/").pop()!;
        const send = (status: number, payload: unknown) => {
          res.writeHead(status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(payload));
        };
        if (!req.url?.startsWith(`/bot${TOKEN}/`) && !req.url?.startsWith("/bot111111:second_valid_token/")) {
          return send(401, { ok: false, error_code: 401, description: "Unauthorized" });
        }
        calls.push({ method, body });
        if (method === "getMe") return send(200, { ok: true, result: { id: 5, username: "shop_bot" } });
        if (String(body.chat_id) === "400") return send(400, { ok: false, error_code: 400, description: "Bad Request: chat not found" });
        return send(200, { ok: true, result: { message_id: calls.length } });
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    app = await createTestApp({ CREDENTIALS_ENCRYPTION_KEY: KEY, BALE_API_BASE_URL: base });
  });
  afterAll(async () => {
    await app.close();
    server.close();
  });

  it("verifies the token with getMe, stores it encrypted and never returns it", async () => {
    const u = await registerUser(app);
    const path = `/organizations/${u.orgId}/messaging-accounts`;
    const bad = await u.client.post(`${path}/bale-bot`, { displayName: "بازو", token: "000000:wrong_token_value" }).expect(400);
    expect(bad.body.fieldErrors.token).toBeDefined();
    await u.client.post(`${path}/bale-bot`, { displayName: "بازو", token: "bad token/../x" }).expect(400);

    const res = await u.client.post(`${path}/bale-bot`, { displayName: "بازوی فروشگاه", token: TOKEN }).expect(201);
    expect(res.body).toMatchObject({ provider: "BALE_BOT", externalName: "@shop_bot", isTestOnly: false });
    const list = await u.client.get(path).expect(200);
    expect(list.body.baleEnabled).toBe(true);
    for (const text of [JSON.stringify(res.body), JSON.stringify(list.body)]) {
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain("credentials");
    }
    const row = await prisma(app).messagingAccount.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.credentialsEncrypted).toMatch(/^v1\./);
    expect(row.credentialsEncrypted).not.toContain(TOKEN);
    const audit = await prisma(app).auditLog.findMany({ where: { organizationId: u.orgId } });
    expect(JSON.stringify(audit)).not.toContain(TOKEN);

    await u.client.post(`${path}/${res.body.id}/check`).expect(200);
    await u.client.put(`${path}/${res.body.id}/token`, { token: "000000:wrong_token_value" }).expect(400);
    await u.client.put(`${path}/${res.body.id}/token`, { token: "111111:second_valid_token" }).expect(200);

    const other = await registerUser(app);
    await other.client.post(`/organizations/${other.orgId}/messaging-accounts/${res.body.id}/check`).expect(404);
  });

  it("sends a campaign through the Bale provider with the right payload and outcomes", async () => {
    const u = await registerUser(app);
    const org = `/organizations/${u.orgId}`;
    const { body: account } = await u.client.post(`${org}/messaging-accounts/bale-bot`, { displayName: "بازو", token: TOKEN, rateLimitPerMinute: 600 }).expect(201);
    await u.client.post(`${org}/contacts`, { baleChatId: "555001" }).expect(201);
    await u.client.post(`${org}/contacts`, { baleChatId: "400" }).expect(201);
    const { body: c } = await u.client.post(`${org}/campaigns`, { name: "بله", messageText: "سلام از بازو", messagingAccountId: account.id }).expect(201);
    await u.client.post(`${org}/campaigns/${c.id}/start`, {}).expect(200);

    const result = await dispatchCampaign(
      {
        prisma: prisma(app),
        redis: app.get(RedisService).client,
        log: { info: () => undefined, warn: () => undefined, error: () => undefined },
        providerFor: providerResolver({ mockEnabled: false, credentialsKey: KEY, baleApiBaseUrl: base }),
        enqueue: async () => undefined,
      },
      c.id,
    );
    expect(result.outcome).toBe("completed");
    const sent = calls.filter((x) => x.method === "sendMessage" && x.body.text === "سلام از بازو");
    expect(sent.map((x) => x.body.chat_id).sort()).toEqual(["400", "555001"]);
    const done = await u.client.get(`${org}/campaigns/${c.id}`).expect(200);
    // Bale gives no delivery receipts: success is ACCEPTED, never DELIVERED.
    expect(done.body.counts).toMatchObject({ ACCEPTED: 1, FAILED: 1, DELIVERED: 0 });
  });

  it("reports 503 when the Bale API is unreachable and when no encryption key is set", async () => {
    const tmp = createServer();
    await new Promise<void>((r) => tmp.listen(0, "127.0.0.1", r));
    const port = (tmp.address() as AddressInfo).port;
    await new Promise((r) => tmp.close(r));
    const offline = await createTestApp({ CREDENTIALS_ENCRYPTION_KEY: KEY, BALE_API_BASE_URL: `http://127.0.0.1:${port}` });
    const noKey = await createTestApp({ BALE_API_BASE_URL: base, CREDENTIALS_ENCRYPTION_KEY: "" });
    try {
      const a = await registerUser(offline);
      await a.client.post(`/organizations/${a.orgId}/messaging-accounts/bale-bot`, { displayName: "بازو", token: TOKEN }).expect(503);
      const b = await registerUser(noKey);
      expect((await b.client.get(`/organizations/${b.orgId}/messaging-accounts`).expect(200)).body.baleEnabled).toBe(false);
      await b.client.post(`/organizations/${b.orgId}/messaging-accounts/bale-bot`, { displayName: "بازو", token: TOKEN }).expect(503);
    } finally {
      await offline.close();
      await noKey.close();
    }
  });
});
