import { registerSchema } from "@bcp/shared";
import { AppException } from "../errors";
import { ZodValidationPipe } from "./zod-validation.pipe";

describe("ZodValidationPipe", () => {
  const pipe = new ZodValidationPipe(registerSchema);

  it("returns parsed data and strips unknown keys", () => {
    const out = pipe.transform({
      fullName: "علی",
      email: "A@B.CO",
      password: "goodpassword1",
      organizationName: "شرکت",
      acceptTerms: true,
      platformRole: "SUPER_ADMIN",
    });
    expect(out.email).toBe("a@b.co");
    expect(out).not.toHaveProperty("platformRole");
  });

  it("throws a VALIDATION_ERROR with per-field Persian messages", () => {
    try {
      pipe.transform({ email: "bad" });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      const e = err as AppException;
      expect(e.code).toBe("VALIDATION_ERROR");
      expect(e.fieldErrors?.email?.[0]).toMatch(/ایمیل/);
    }
  });
});
