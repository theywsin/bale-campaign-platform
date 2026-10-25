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
