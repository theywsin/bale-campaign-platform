import { baseEnvSchema, parseEnv } from "@bcp/config";
import { z } from "zod";

export const workerEnvSchema = baseEnvSchema.extend({
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
});
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
export const loadWorkerEnv = (): WorkerEnv => parseEnv(workerEnvSchema);
