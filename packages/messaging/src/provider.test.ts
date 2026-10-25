import { test } from "node:test";
import assert from "node:assert/strict";
import { decideRetry } from "@bcp/shared";
import { MessagingError, MockMessagingProvider, normalizeHttpFailure, toMessagingError } from "./index";

test("HTTP failures are normalized to the right error kind", () => {
  assert.equal(normalizeHttpFailure({ networkPhase: "connect" }).kind, "RETRYABLE");
  assert.equal(normalizeHttpFailure({ networkPhase: "after-send" }).kind, "UNKNOWN_OUTCOME");
  assert.equal(normalizeHttpFailure({ status: 502 }).kind, "UNKNOWN_OUTCOME");
  assert.equal(normalizeHttpFailure({ status: 400, description: "chat not found" }).kind, "PERMANENT");
  assert.equal(normalizeHttpFailure({ status: 403 }).code, "UNAUTHORIZED");
  const rl = normalizeHttpFailure({ status: 429, retryAfterSeconds: 7 });
  assert.equal(rl.kind, "RETRYABLE");
  assert.equal(rl.retryAfterMs, 7000);
});

test("unexpected exceptions never become retryable", () => {
  const e = toMessagingError(new TypeError("boom"));
  assert.equal(e.kind, "UNKNOWN_OUTCOME");
  assert.equal(decideRetry(e.kind, 1).action, "unknown");
  assert.ok(!e.message.includes("boom"));
});

test("mock provider: deterministic outcomes by chat id", async () => {
  const p = new MockMessagingProvider();
  const ok = await p.sendText({ chatId: "1000", text: "x", idempotencyKey: "r1:a1" });
  assert.match(ok.providerMessageId, /^mock-/);
  assert.equal(ok.deliveryConfirmed, false);

  await assert.rejects(p.sendText({ chatId: "1991", text: "x", idempotencyKey: "r2:a1" }), (e: MessagingError) => e.kind === "PERMANENT");
  await assert.rejects(p.sendText({ chatId: "1993", text: "x", idempotencyKey: "r3:a1" }), (e: MessagingError) => e.kind === "UNKNOWN_OUTCOME");
  await assert.rejects(p.sendText({ chatId: "1992", text: "x", idempotencyKey: "r4:a1" }), (e: MessagingError) => e.kind === "RETRYABLE");
  // second attempt succeeds, also in a fresh process (attempt number in the key)
  await new MockMessagingProvider().sendText({ chatId: "1992", text: "x", idempotencyKey: "r4:a2" });
});
