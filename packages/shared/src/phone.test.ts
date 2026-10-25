import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeChatId, normalizePhone, toAsciiDigits } from "./phone";

test("Iranian mobiles in all common forms normalize to E.164", () => {
  for (const v of ["09121234567", "9121234567", "+989121234567", "989121234567", "00989121234567", "0912 123 4567", "0912-123-4567"]) {
    assert.equal(normalizePhone(v), "+989121234567", v);
  }
});

test("Persian and Arabic digits are accepted", () => {
  assert.equal(toAsciiDigits("۰۹۱۲٣"), "09123");
  assert.equal(normalizePhone("۰۹۱۲۱۲۳۴۵۶۷"), "+989121234567");
});

test("invalid numbers are rejected", () => {
  for (const v of ["", "abc", "0912123", "02112345678", "+98211234567", "12345", "+0123456789", "0912123456789"]) {
    assert.equal(normalizePhone(v), null, v);
  }
});

test("international numbers need a + or 00 prefix", () => {
  assert.equal(normalizePhone("+447911123456"), "+447911123456");
  assert.equal(normalizePhone("00447911123456"), "+447911123456");
});

test("chat ids are integers", () => {
  assert.equal(normalizeChatId(" 123456 "), "123456");
  assert.equal(normalizeChatId("-100123"), "-100123");
  assert.equal(normalizeChatId("۱۲۳"), "123");
  assert.equal(normalizeChatId("12a"), null);
});
