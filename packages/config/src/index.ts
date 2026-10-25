import { z } from "zod";

/** Parses a comma separated list such as "a,b , c" into ["a","b","c"]. */
export const commaList = z
  .string()
  .default("")
  .transform((v) =>
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

/** Accepts "true"/"false"/"1"/"0" from the environment. */
export const booleanFlag = (defaultValue: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => (v === undefined ? defaultValue : v === "true" || v === "1"));

export const nodeEnvSchema = z.enum(["development", "test", "production"]).default("development");

export const baseEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  APP_VERSION: z.string().default("0.1.0"),
  DATABASE_URL: z.string().url({ message: "DATABASE_URL must be a valid postgres URL" }),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  REDIS_URL: z.string().url({ message: "REDIS_URL must be a valid redis URL" }),
});

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join("\n  - ")}`);
    this.name = "EnvValidationError";
  }
}

/**
 * Validates environment variables against a schema. Error messages name the
 * variable but never echo its value, so secrets cannot leak into logs.
 */
export function parseEnv<T extends z.ZodType>(schema: T, source: NodeJS.ProcessEnv = process.env): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }
  return result.data;
}
export * from "./runtime";
