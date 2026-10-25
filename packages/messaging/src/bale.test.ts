import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { BaleBotProvider, CredentialsCipher, MessagingError } from "./index";

// Local stand-in for the Bale Bot API. Behaviour by chat_id.
const TOKEN = "123456:TEST_token-abcdef";
let server: Server;
let base = "";
const seen: { url: string; body: unknown }[] = [];

before(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      seen.push({ url: req.url ?? "", body });
      const send = (status: number, payload: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payload));
      };
      if (!req.url?.startsWith(`/bot${TOKEN}/`)) return send(401, { ok: false, error_code: 401, description: "Unauthorized" });
      if (req.url.endsWith("/getMe")) return send(200, { ok: true, result: { id: 1, username: "test_bot" } });
      switch (String(body.chat_id)) {
        case "400": return send(400, { ok: false, error_code: 400, description: "Bad Request: chat not found" });
        case "403": return send(403, { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" });
        case "429": return send(429, { ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 3 } });
        case "500": return send(502, "bad gateway");
        case "slow": return setTimeout(() => send(200, { ok: true, result: { message_id: 1 } }), 500);
        default: return send(200, { ok: true, result: { message_id: 42, chat: { id: body.chat_id } } });
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const fails = (p: Promise<unknown>, kind: string, code?: string) =>
  assert.rejects(p, (e: MessagingError) => {
    assert.equal(e.kind, kind);
    if (code) assert.equal(e.code, code);
    assert.ok(!e.message.includes(TOKEN));
    return true;
  });

test("sendMessage success is ACCEPTED-level, never a delivery confirmation", async () => {
  const p = new BaleBotProvider(TOKEN, base);
  const r = await p.sendText({ chatId: "777", text: "سلام", idempotencyKey: "k" });
  assert.deepEqual(r, { providerMessageId: "42", deliveryConfirmed: false });
  assert.deepEqual(seen.at(-1)!.body, { chat_id: "777", text: "سلام" });
  assert.equal((await p.getMe()).username, "test_bot");
});

test("Bale errors map to permanent, retryable and unknown outcomes", async () => {
  const p = new BaleBotProvider(TOKEN, base);
  const req = (chatId: string) => p.sendText({ chatId, text: "x", idempotencyKey: "k" });
  await fails(req("400"), "PERMANENT", "HTTP_400");
  await fails(req("403"), "PERMANENT", "UNAUTHORIZED");
  await assert.rejects(req("429"), (e: MessagingError) => e.kind === "RETRYABLE" && e.retryAfterMs === 3000);
  await fails(req("500"), "UNKNOWN_OUTCOME");
  await fails(new BaleBotProvider("999:wrong_token_xx", base).getMe(), "PERMANENT", "UNAUTHORIZED");
});

test("timeout after sending is UNKNOWN; connection refused is RETRYABLE", async () => {
  await fails(new BaleBotProvider(TOKEN, base, 100).sendText({ chatId: "slow", text: "x", idempotencyKey: "k" }), "UNKNOWN_OUTCOME", "TIMEOUT");
  // A port that was just freed: nothing listens there, so the connection is refused.
  const tmp = createServer();
  await new Promise<void>((r) => tmp.listen(0, "127.0.0.1", r));
  const closedPort = (tmp.address() as AddressInfo).port;
  await new Promise((r) => tmp.close(r));
  await fails(new BaleBotProvider(TOKEN, `http://127.0.0.1:${closedPort}`).getMe(), "RETRYABLE", "NETWORK_CONNECT");
});

test("tokens that could alter the URL are rejected", () => {
  for (const bad of ["short", "123:abc/../x", "123:abc def", "123:abc?x=1"]) {
    assert.throws(() => new BaleBotProvider(bad, base), MessagingError);
  }
});

test("credentials cipher round-trips and is bound to its account", () => {
  const c = new CredentialsCipher(Buffer.alloc(32, 7).toString("base64"));
  const enc = c.encrypt(TOKEN, "acct-1");
  assert.ok(!enc.includes(TOKEN));
  assert.notEqual(enc, c.encrypt(TOKEN, "acct-1"));
  assert.equal(c.decrypt(enc, "acct-1"), TOKEN);
  assert.throws(() => c.decrypt(enc, "acct-2"));
  assert.throws(() => new CredentialsCipher(Buffer.alloc(16).toString("base64")));
});
