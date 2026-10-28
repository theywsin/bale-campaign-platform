import { test } from "node:test";
import assert from "node:assert/strict";
import { changePasswordSchema, emailSchema, passwordSchema, registerSchema } from "./schemas";

test("email is normalized to lower case", () => {
  assert.equal(emailSchema.parse("  Ali@Example.COM "), "ali@example.com");
  assert.equal(emailSchema.safeParse("not-an-email").success, false);
});

test("password policy requires length, a letter and a digit", () => {
  assert.equal(passwordSchema.safeParse("short1").success, false);
  assert.equal(passwordSchema.safeParse("onlyletterslong").success, false);
  assert.equal(passwordSchema.safeParse("1234567890").success, false);
  assert.equal(passwordSchema.safeParse("goodpassword1").success, true);
  assert.equal(passwordSchema.safeParse("رمزعبورقوی۱۲").success, true);
});

test("registration requires accepting the terms and rejects markup in names", () => {
  const base = { fullName: "سارا محمدی", email: "a@b.co", password: "goodpassword1", organizationName: "شرکت نمونه" };
  assert.equal(registerSchema.safeParse({ ...base, acceptTerms: true }).success, true);
  assert.equal(registerSchema.safeParse({ ...base, acceptTerms: false }).success, false);
  assert.equal(registerSchema.safeParse({ ...base, fullName: "<script>x</script>", acceptTerms: true }).success, false);
});

test("new password must differ from the current one", () => {
  assert.equal(changePasswordSchema.safeParse({ currentPassword: "goodpassword1", newPassword: "goodpassword1" }).success, false);
});

test("campaign form: empty list means all contacts, account is required", async () => {
  const { createCampaignSchema } = await import("./schemas");
  const base = { name: "کمپین", messageText: "سلام", messagingAccountId: "0199a6f2-7c1e-7aaa-8bbb-123456789abc" };
  assert.equal(createCampaignSchema.parse({ ...base, listId: "" }).listId, null);
  assert.equal(createCampaignSchema.safeParse({ ...base, messagingAccountId: "" }).success, false);
});

test("contact needs a phone or a chat id and normalizes both", async () => {
  const { createContactSchema } = await import("./schemas");
  assert.equal(createContactSchema.safeParse({ firstName: "x" }).success, false);
  const c = createContactSchema.parse({ phone: "۰۹۱۲۱۲۳۴۵۶۷", baleChatId: " ۱۲۳ ", firstName: "" });
  assert.deepEqual([c.phone, c.baleChatId, c.firstName], ["+989121234567", "123", null]);
});

test("mfa codes accept Persian digits and recovery codes", async () => {
  const { mfaCodeSchema } = await import("./support");
  assert.equal(mfaCodeSchema.parse("۱۲۳ ۴۵۶"), "123456");
  assert.equal(mfaCodeSchema.parse("abcde-12345"), "ABCDE-12345");
  assert.equal(mfaCodeSchema.safeParse("12345").success, false);
});
