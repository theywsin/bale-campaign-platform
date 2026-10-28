import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canTransitionPayment,
  formatRials,
  monthStartUtc,
  nextSubscriptionPeriod,
  planInputSchema,
  redeemLicenseSchema,
  withinLimit,
} from "./billing";

const DAY = 24 * 3600 * 1000;

test("final payment states never change", () => {
  assert.ok(canTransitionPayment("INITIATED", "SUCCEEDED"));
  assert.ok(canTransitionPayment("INITIATED", "FAILED"));
  for (const to of ["INITIATED", "FAILED", "CANCELED"] as const) assert.equal(canTransitionPayment("SUCCEEDED", to), false);
  assert.equal(canTransitionPayment("FAILED", "SUCCEEDED"), false);
  assert.equal(canTransitionPayment("CANCELED", "SUCCEEDED"), false);
});

test("limits: null is unlimited, the cap itself is allowed", () => {
  assert.ok(withinLimit(null, 1_000_000, 5));
  assert.ok(withinLimit(10, 9));
  assert.equal(withinLimit(10, 10), false);
  assert.equal(withinLimit(10, 5, 6), false);
  assert.equal(withinLimit(0, 0), false);
});

test("renewing the same plan extends; another plan starts now", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const endsAt = new Date(now.getTime() + 10 * DAY);
  const same = nextSubscriptionPeriod(now, 30, { planId: "p1", endsAt }, "p1");
  assert.equal(same.extendsCurrent, true);
  assert.equal(same.endsAt.getTime(), endsAt.getTime() + 30 * DAY);
  const other = nextSubscriptionPeriod(now, 30, { planId: "p1", endsAt }, "p2");
  assert.equal(other.extendsCurrent, false);
  assert.equal(other.endsAt.getTime(), now.getTime() + 30 * DAY);
  const expired = nextSubscriptionPeriod(now, 30, { planId: "p1", endsAt: new Date(now.getTime() - DAY) }, "p1");
  assert.equal(expired.extendsCurrent, false);
  assert.equal(nextSubscriptionPeriod(now, 7, null, "p1").endsAt.getTime(), now.getTime() + 7 * DAY);
});

test("rials are formatted with Persian digits", () => {
  assert.equal(formatRials(1200000), "۱٬۲۰۰٬۰۰۰ ریال");
  assert.equal(formatRials("0"), "۰ ریال");
});

test("month start is UTC", () => {
  assert.equal(monthStartUtc(new Date("2026-10-28T23:59:00Z")).toISOString(), "2026-10-01T00:00:00.000Z");
});

test("plan input: empty limits mean unlimited, negative price rejected", () => {
  const ok = planInputSchema.parse({ code: "Pro-1", name: "حرفه‌ای", priceRials: "500000", periodDays: "30", maxContacts: "", maxMembers: "5" });
  assert.equal(ok.code, "pro-1");
  assert.equal(ok.maxContacts, null);
  assert.equal(ok.maxMembers, 5);
  assert.equal(planInputSchema.safeParse({ code: "x1", name: "نام", priceRials: -1, periodDays: 30 }).success, false);
});

test("license keys are normalized and validated", () => {
  assert.equal(redeemLicenseSchema.parse({ key: " bcp-abcd-efgh-jkmn-pqrs " }).key, "BCP-ABCD-EFGH-JKMN-PQRS");
  assert.equal(redeemLicenseSchema.safeParse({ key: "BCP-ABCD-EFGH-JKMN-PQRI" }).success, false);
  assert.equal(redeemLicenseSchema.safeParse({ key: "BCP-ABCD" }).success, false);
});

test("plan update changes only the fields sent", async () => {
  const { updatePlanSchema } = await import("./billing");
  assert.deepEqual(updatePlanSchema.parse({ name: "نام جدید" }), { name: "نام جدید" });
  assert.deepEqual(updatePlanSchema.parse({ maxContacts: "" }), { maxContacts: null });
});
