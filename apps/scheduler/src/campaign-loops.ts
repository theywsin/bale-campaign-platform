import type { PrismaClient } from "@bcp/database";
import { cancelStaleOrders, expireSubscriptions, campaignsNeedingDispatch, promoteScheduledCampaigns, recoverStuckRecipients, relayOutbox } from "@bcp/engine";
import { CAMPAIGN_QUEUE, OUTBOX_CAMPAIGN_DISPATCH } from "@bcp/shared";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { Logger } from "pino";

const OUTBOX_INTERVAL_MS = 1000;
const SCHEDULE_INTERVAL_MS = 15_000;
const RECOVERY_INTERVAL_MS = 60_000;
const BILLING_INTERVAL_MS = 5 * 60_000;

interface Options {
  prisma: PrismaClient;
  redis: Redis;
  redisUrl: string;
  log: Logger;
}

/**
 * Runs the outbox relay, the scheduled-campaign promoter and stuck-send
 * recovery. Each loop takes a short Redis lock so only one scheduler acts
 * per tick; the relay is additionally safe to run concurrently (SKIP LOCKED).
 */
export function startCampaignLoops({ prisma, redis, redisUrl, log }: Options): { close(): Promise<void> } {
  // BullMQ needs its own connection with maxRetriesPerRequest=null.
  const queueConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  queueConnection.on("error", (err) => log.warn({ err: err.message }, "queue redis connection error"));
  const queue = new Queue(CAMPAIGN_QUEUE, {
    connection: queueConnection,
    defaultJobOptions: { removeOnComplete: { age: 24 * 3600, count: 1000 }, removeOnFail: { age: 7 * 24 * 3600 } },
  });

  let stopped = false;
  const timers: NodeJS.Timeout[] = [];

  const every = (name: string, ms: number, fn: () => Promise<void>) => {
    let running = false;
    const tick = async () => {
      if (running || stopped) return;
      running = true;
      try {
        if ((await redis.set(`scheduler:lock:${name}`, String(process.pid), "PX", Math.max(ms - 100, 500), "NX")) === "OK") await fn();
      } catch (err) {
        log.error({ loop: name, err: err instanceof Error ? err.message : String(err) }, "scheduler loop failed");
      } finally {
        running = false;
      }
    };
    timers.push(setInterval(() => void tick(), ms));
    void tick();
  };

  every("outbox", OUTBOX_INTERVAL_MS, async () => {
    const n = await relayOutbox(prisma, {
      publish: async (e) => {
        if (e.type !== OUTBOX_CAMPAIGN_DISPATCH) throw new Error(`unknown outbox event type: ${e.type}`);
        const { campaignId } = e.payload as { campaignId: string };
        // jobId = event id: republishing the same event does not create a second job.
        await queue.add("dispatch", { campaignId }, { jobId: `outbox-${e.id}` });
      },
    });
    if (n) log.info({ published: n }, "outbox relayed");
  });

  every("schedule", SCHEDULE_INTERVAL_MS, async () => {
    const n = await promoteScheduledCampaigns(prisma);
    if (n) log.info({ promoted: n }, "scheduled campaigns queued");
  });

  every("recovery", RECOVERY_INTERVAL_MS, async () => {
    const r = await recoverStuckRecipients(prisma);
    if (r.unknown || r.requeued) log.warn(r, "recovered stuck recipients");
    // Re-kick campaigns whose job may have been lost; the campaign lock makes duplicates harmless.
    const bucket = Math.floor(Date.now() / RECOVERY_INTERVAL_MS);
    for (const campaignId of await campaignsNeedingDispatch(prisma)) {
      await queue.add("dispatch", { campaignId }, { jobId: `kick-${campaignId}-${bucket}` });
    }
  });

  every("billing", BILLING_INTERVAL_MS, async () => {
    const expired = await expireSubscriptions(prisma);
    const canceled = await cancelStaleOrders(prisma);
    if (expired || canceled) log.info({ expiredSubscriptions: expired, canceledOrders: canceled }, "billing maintenance");
  });

  return {
    async close() {
      stopped = true;
      timers.forEach(clearInterval);
      await queue.close();
      queueConnection.disconnect();
    },
  };
}
