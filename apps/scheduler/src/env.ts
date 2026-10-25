import { baseEnvSchema, parseEnv } from "@bcp/config";
import { z } from "zod";

export const schedulerEnvSchema = baseEnvSchema.extend({
  SCHEDULER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(4200),
});
export type SchedulerEnv = z.infer<typeof schedulerEnvSchema>;
export const loadSchedulerEnv = (): SchedulerEnv => parseEnv(schedulerEnvSchema);
