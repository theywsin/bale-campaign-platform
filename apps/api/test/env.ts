/**
 * Environment for integration tests. Uses a dedicated database (bcp_test) and
 * Redis DB 15 so tests never touch development data. Override with
 * TEST_DATABASE_URL / TEST_REDIS_URL.
 */
export function testEnvSource(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://bcp:bcp_dev_only@127.0.0.1:5432/bcp_test?schema=public",
    REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379/15",
    APP_URL: "http://localhost:3000",
    COOKIE_SECURE: "false",
    RATE_LIMIT_PER_MINUTE: "100000",
    AUTH_RATE_LIMIT_PER_MINUTE: "100000",
    LOGIN_MAX_ATTEMPTS: "5",
    // A syntactically valid SMTP URL enables the e-mail queue; tests read jobs from it, nothing is sent.
    SMTP_URL: "smtp://localhost:2525",
    MESSAGING_MOCK_ENABLED: "true",
    PAYMENTS_MOCK_ENABLED: "true",
    ADMIN_MFA_REQUIRED: "false",
    // Test-only key (not secret): 2FA secrets need the credentials cipher.
    CREDENTIALS_ENCRYPTION_KEY: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
    PAYMENT_WEBHOOK_SECRET: "test-only-webhook-secret-0123456789abcdef",
    ...overrides,
  };
}
