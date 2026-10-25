import { createPrismaClient } from "@bcp/database";
import { onShutdown, startHealthServer } from "@bcp/config";
import { Redis } from "ioredis";
import pino from "pino";
import { loadSchedulerEnv } from "./env";

async function main(): Promise<void> {
  const env = loadSchedulerEnv();
  const log = pino({ level: env.LOG_LEVEL, base: { service: "scheduler" } });
  const prisma = createPrismaClient({ databaseUrl: env.DATABASE_URL, poolMax: 2 });
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
  redis.on("error", (err) => log.warn({ err: err.message }, "redis connection error"));

  const health = startHealthServer({
    service: "scheduler",
    version: env.APP_VERSION,
    port: env.SCHEDULER_HEALTH_PORT,
    checks: {
      database: async () => void (await prisma.$queryRaw`SELECT 1`),
      redis: async () => void (await redis.ping()),
    },
  });

  log.info("scheduler started");

  onShutdown(async () => {
    health.close();
    await prisma.$disconnect();
    redis.disconnect();
  }, (m) => log.info(m));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
