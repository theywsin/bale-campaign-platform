import { base32Decode, base32Encode, generateRecoveryCode, generateTotpSecret, otpauthUri, totpAt, verifyTotp } from "./totp";

// RFC 6238 appendix B test secret "12345678901234567890" (SHA1), truncated to 6 digits.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP", () => {
  it("matches the RFC 6238 test vectors", () => {
    expect(totpAt(RFC_SECRET, Math.floor(59 / 30))).toBe("287082");
    expect(totpAt(RFC_SECRET, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totpAt(RFC_SECRET, Math.floor(1234567890 / 30))).toBe("005924");
    expect(totpAt(RFC_SECRET, Math.floor(2000000000 / 30))).toBe("279037");
  });

  it("accepts one step of drift and nothing more", () => {
    const secret = generateTotpSecret();
    const now = 1_800_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(secret, totpAt(secret, step), now)).toBe(step);
    expect(verifyTotp(secret, totpAt(secret, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step + 2), now)).toBeNull();
    expect(verifyTotp(secret, "12345", now)).toBeNull();
  });

  it("round-trips base32 and builds an otpauth URI", () => {
    const buf = Buffer.from("hello world!");
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
    expect(otpauthUri("ABC", "a@b.c", "بله‌کمپین")).toMatch(/^otpauth:\/\/totp\/.*secret=ABC&issuer=/);
    expect(generateRecoveryCode()).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/);
  });
});
