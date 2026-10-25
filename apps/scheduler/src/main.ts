import { createPrismaClient } from "@bcp/database";
import { onShutdown, startHealthServer } from "@bcp/config";
import { Redis } from "ioredis";
import pino from "pino";
import { loadSchedulerEnv } from "./env";
import { purgeExpiredAuthData } from "./maintenance";

const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;
const LOCK_KEY = "scheduler:lock:maintenance";

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

  // A Redis lock keeps maintenance single-run even if several schedulers are started by mistake.
  const runMaintenance = async () => {
    const locked = await redis.set(LOCK_KEY, String(process.pid), "PX", MAINTENANCE_INTERVAL_MS - 60_000, "NX");
    if (locked !== "OK") return;
    try {
      const removed = await purgeExpiredAuthData(prisma);
      log.info({ removed }, "maintenance: purged expired auth data");
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : String(err) }, "maintenance failed");
    }
  };
  const timer = setInterval(() => void runMaintenance(), MAINTENANCE_INTERVAL_MS);
  void runMaintenance();

  // Campaign scheduling and the transactional outbox relay are added in phase C.
  log.info("scheduler started");

  onShutdown(async () => {
    clearInterval(timer);
    health.close();
    await prisma.$disconnect();
    redis.disconnect();
  }, (m) => log.info(m));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
