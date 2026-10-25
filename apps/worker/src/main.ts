import { createPrismaClient } from "@bcp/database";
import { onShutdown, startHealthServer } from "@bcp/config";
import { Redis } from "ioredis";
import pino from "pino";
import { loadWorkerEnv } from "./env";
import { startEmailWorker } from "./email.processor";
import { startCampaignWorker } from "./campaign.processor";

async function main(): Promise<void> {
  const env = loadWorkerEnv();
  const log = pino({ level: env.LOG_LEVEL, base: { service: "worker" } });
  const prisma = createPrismaClient({ databaseUrl: env.DATABASE_URL, poolMax: env.DATABASE_POOL_MAX });
  // BullMQ requires maxRetriesPerRequest=null on the connection used by workers.
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  redis.on("error", (err) => log.warn({ err: err.message }, "redis connection error"));

  const health = startHealthServer({
    service: "worker",
    version: env.APP_VERSION,
    port: env.WORKER_HEALTH_PORT,
    checks: {
      database: async () => void (await prisma.$queryRaw`SELECT 1`),
      redis: async () => void (await redis.ping()),
    },
  });

  const emailWorker = env.SMTP_URL
    ? startEmailWorker({ connection: redis, smtpUrl: env.SMTP_URL, from: env.MAIL_FROM, log })
    : null;
  if (!emailWorker) log.warn("SMTP_URL not set: e-mail queue is not processed");

  const campaignWorker = startCampaignWorker({
    connection: redis,
    prisma,
    log,
    concurrency: env.WORKER_CONCURRENCY,
    mockEnabled: env.MESSAGING_MOCK_ENABLED,
    credentialsKey: env.CREDENTIALS_ENCRYPTION_KEY,
    baleApiBaseUrl: env.BALE_API_BASE_URL,
  });
  log.info({ concurrency: env.WORKER_CONCURRENCY, email: Boolean(emailWorker), mock: env.MESSAGING_MOCK_ENABLED }, "worker started");

  onShutdown(async () => {
    health.close();
    await emailWorker?.close();
    await campaignWorker.close();
    await prisma.$disconnect();
    redis.disconnect();
  }, (m) => log.info(m));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
