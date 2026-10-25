import type { PrismaClient } from "@bcp/database";
import { dispatchCampaign, type AccountForSend } from "@bcp/engine";
import { MockMessagingProvider, type MessagingProvider } from "@bcp/messaging";
import { CAMPAIGN_QUEUE } from "@bcp/shared";
import { Queue, Worker } from "bullmq";
import type { Redis } from "ioredis";
import type { Logger } from "pino";

export interface CampaignWorkerOptions {
  connection: Redis;
  prisma: PrismaClient;
  log: Logger;
  concurrency: number;
  mockEnabled: boolean;
}

/** Consumes `{ campaignId }` jobs; each job sends what is currently due for that campaign. */
export function startCampaignWorker(opts: CampaignWorkerOptions): { close(): Promise<void> } {
  const queue = new Queue(CAMPAIGN_QUEUE, { connection: opts.connection });
  const mock = new MockMessagingProvider();

  const providerFor = (account: AccountForSend): MessagingProvider | { unavailable: string } => {
    if (account.provider === "MOCK") {
      return opts.mockEnabled ? mock : { unavailable: "حساب آزمایشی (Mock) در این استقرار غیرفعال است." };
    }
    return { unavailable: "اتصال بازوی بله هنوز پیاده‌سازی نشده است (فاز D)." };
  };

  const worker = new Worker<{ campaignId: string }>(
    CAMPAIGN_QUEUE,
    async (job) => {
      const result = await dispatchCampaign(
        {
          prisma: opts.prisma,
          redis: opts.connection,
          log: opts.log,
          providerFor,
          enqueue: async (campaignId, delayMs) => {
            await queue.add("dispatch", { campaignId }, { delay: delayMs, jobId: `retry-${campaignId}-${Date.now() + delayMs}` });
          },
        },
        job.data.campaignId,
      );
      opts.log.info({ campaignId: job.data.campaignId, ...result }, "campaign dispatch run finished");
      return result;
    },
    { connection: opts.connection, concurrency: opts.concurrency },
  );
  worker.on("failed", (job, err) => opts.log.error({ jobId: job?.id, err: err.message }, "campaign job failed"));

  return {
    async close() {
      await worker.close();
      await queue.close();
    },
  };
}
