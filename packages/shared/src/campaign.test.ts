import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAMPAIGN_STATUSES,
  campaignStatesAllowing,
  canTransitionCampaign,
  canTransitionRecipient,
  decideRetry,
  isCampaignTerminal,
  RECIPIENT_STATUSES,
} from "./campaign";

test("campaign lifecycle transitions", () => {
  assert.ok(canTransitionCampaign("DRAFT", "QUEUED"));
  assert.ok(canTransitionCampaign("DRAFT", "SCHEDULED"));
  assert.ok(canTransitionCampaign("RUNNING", "PAUSED"));
  assert.ok(canTransitionCampaign("PAUSED", "QUEUED"));
  assert.ok(canTransitionCampaign("RUNNING", "COMPLETED"));
  assert.equal(canTransitionCampaign("DRAFT", "RUNNING"), false);
  assert.equal(canTransitionCampaign("PAUSED", "RUNNING"), false);
  assert.equal(canTransitionCampaign("COMPLETED", "QUEUED"), false);
  assert.equal(canTransitionCampaign("CANCELLED", "QUEUED"), false);
});

test("terminal states have no exits", () => {
  for (const s of CAMPAIGN_STATUSES) {
    const exits = CAMPAIGN_STATUSES.filter((t) => canTransitionCampaign(s, t));
    assert.equal(isCampaignTerminal(s), exits.length === 0, s);
  }
  assert.deepEqual(campaignStatesAllowing("PAUSED").sort(), ["QUEUED", "RUNNING", "SCHEDULED"]);
});

test("recipient states: final states are final and DELIVERED only follows ACCEPTED", () => {
  for (const final of ["DELIVERED", "FAILED", "UNKNOWN", "SUPPRESSED"] as const) {
    for (const t of RECIPIENT_STATUSES) assert.equal(canTransitionRecipient(final, t), false, `${final}->${t}`);
  }
  for (const s of RECIPIENT_STATUSES) {
    assert.equal(canTransitionRecipient(s, "DELIVERED"), s === "ACCEPTED", s);
  }
  // UNKNOWN can never go back to PENDING (no automatic resend).
  assert.equal(canTransitionRecipient("UNKNOWN", "PENDING"), false);
});

test("retry policy: unknown outcome is never retried", () => {
  assert.deepEqual(decideRetry("UNKNOWN_OUTCOME", 1), { action: "unknown" });
});

test("retry policy: permanent errors fail immediately", () => {
  assert.deepEqual(decideRetry("PERMANENT", 1), { action: "fail" });
});

test("retry policy: retryable errors back off exponentially up to the limit", () => {
  const p = { maxAttempts: 4, baseDelayMs: 1000, maxDelayMs: 5000 };
  assert.deepEqual(decideRetry("RETRYABLE", 1, p), { action: "retry", delayMs: 1000 });
  assert.deepEqual(decideRetry("RETRYABLE", 2, p), { action: "retry", delayMs: 2000 });
  assert.deepEqual(decideRetry("RETRYABLE", 3, p), { action: "retry", delayMs: 4000 });
  assert.deepEqual(decideRetry("RETRYABLE", 4, p), { action: "fail" });
  assert.deepEqual(decideRetry("RETRYABLE", 1, p, 3000), { action: "retry", delayMs: 3000 });
  assert.deepEqual(decideRetry("RETRYABLE", 1, p, 60_000), { action: "retry", delayMs: 5000 });
});
