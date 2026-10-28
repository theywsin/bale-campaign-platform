import { EnvValidationError } from "@bcp/config";
import { loadApiEnv } from "./env";

const base = {
  DATABASE_URL: "postgresql://u:supersecretpw@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  APP_URL: "https://panel.example.com",
};

describe("API environment", () => {
  it("applies secure defaults", () => {
    const env = loadApiEnv({ ...base, NODE_ENV: "production" });
    expect(env.COOKIE_SECURE).toBe(true);
    expect(env.SWAGGER_ENABLED).toBe(false);
  });

  it("refuses insecure cookies in production", () => {
    expect(() => loadApiEnv({ ...base, NODE_ENV: "production", COOKIE_SECURE: "false" })).toThrow(EnvValidationError);
  });

  it("requires a strong webhook secret when the mock payment gateway is on", () => {
    expect(loadApiEnv(base).PAYMENTS_MOCK_ENABLED).toBe(false);
    expect(() => loadApiEnv({ ...base, PAYMENTS_MOCK_ENABLED: "true" })).toThrow(EnvValidationError);
    expect(() => loadApiEnv({ ...base, PAYMENTS_MOCK_ENABLED: "true", PAYMENT_WEBHOOK_SECRET: "short" })).toThrow(EnvValidationError);
    expect(loadApiEnv({ ...base, PAYMENTS_MOCK_ENABLED: "true", PAYMENT_WEBHOOK_SECRET: "x".repeat(32) }).PAYMENTS_MOCK_ENABLED).toBe(true);
  });

  it("does not echo secret values in validation errors", () => {
    try {
      loadApiEnv({ ...base, APP_URL: "not a url supersecretpw" });
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("APP_URL");
      expect((err as Error).message).not.toContain("supersecretpw");
    }
  });
});
