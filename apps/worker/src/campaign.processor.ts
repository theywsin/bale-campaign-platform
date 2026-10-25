import type { PrismaClient } from "@bcp/database";
import { dispatchCampaign, providerResolver, type ProviderOptions } from "@bcp/engine";
import { CAMPAIGN_QUEUE } from "@bcp/shared";
import { Queue, Worker } from "bullmq";
import type { Redis } from "ioredis";
import type { Logger } from "pino";

export interface CampaignWorkerOptions extends ProviderOptions {
  connection: Redis;
  prisma: PrismaClient;
  log: Logger;
  concurrency: number;
}

/** Consumes `{ campaignId }` jobs; each job sends what is currently due for that campaign. */
export function startCampaignWorker(opts: CampaignWorkerOptions): { close(): Promise<void> } {
  const queue = new Queue(CAMPAIGN_QUEUE, { connection: opts.connection });
  const providerFor = providerResolver(opts);

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
