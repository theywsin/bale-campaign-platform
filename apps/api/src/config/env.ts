import { baseEnvSchema, booleanFlag, commaList, parseEnv } from "@bcp/config";
import { z } from "zod";

export const apiEnvSchema = baseEnvSchema
  .extend({
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    /** Public origin of the web panel, used in e-mail links and as the default allowed origin. */
    APP_URL: z.string().url(),
    /** Extra origins allowed for CORS and CSRF origin checks. */
    CORS_ORIGINS: commaList,
    /** Number of reverse-proxy hops to trust for client IP (X-Forwarded-For). */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    COOKIE_SECURE: booleanFlag(true),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(24 * 7),
    SESSION_IDLE_TIMEOUT_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(48),
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(5),
    LOGIN_WINDOW_SECONDS: z.coerce.number().int().min(10).max(86_400).default(900),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(100_000).default(300),
    /** Per-IP limit for register / password reset / e-mail verification endpoints. */
    AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(100_000).default(10),
    SWAGGER_ENABLED: booleanFlag(false),
    /** SMTP connection string, e.g. smtps://user:pass@mail.example.com:465. Empty disables e-mail. */
    SMTP_URL: z.string().optional().transform((v) => (v ? v : undefined)),
    MAIL_FROM: z.string().default("Bale Campaign <no-reply@example.com>"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && !env.COOKIE_SECURE) {
      ctx.addIssue({ code: "custom", path: ["COOKIE_SECURE"], message: "must be true in production" });
    }
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  return parseEnv(apiEnvSchema, source);
}

export const API_ENV = Symbol("API_ENV");

/** Origins allowed for CORS and for the CSRF Origin check. */
export function allowedOrigins(env: ApiEnv): string[] {
  return [new URL(env.APP_URL).origin, ...env.CORS_ORIGINS.map((o) => new URL(o).origin)];
}
