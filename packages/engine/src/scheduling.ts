import type { PrismaClient } from "@bcp/database";
import { OUTBOX_CAMPAIGN_DISPATCH } from "@bcp/shared";

export interface OutboxPublisher {
  /** Must be idempotent for the same event id (e.g. BullMQ jobId = event id). */
  publish(event: { id: string; type: string; payload: unknown }): Promise<void>;
}

const MAX_OUTBOX_ATTEMPTS = 10;

/**
 * Relays pending outbox events to the queue. Rows are locked with
 * FOR UPDATE SKIP LOCKED so several relays never publish the same event
 * concurrently; a crash after publish and before commit republishes the
 * event, which the idempotent publisher and the campaign lock absorb.
 */
export async function relayOutbox(prisma: PrismaClient, publisher: OutboxPublisher, limit = 100): Promise<number> {
  return prisma.$transaction(
    async (tx) => {
      const events = await tx.$queryRaw<{ id: string; type: string; payload: unknown; attempts: number }[]>`
        SELECT id, type, payload, attempts FROM outbox_events
         WHERE status = 'PENDING'::"OutboxStatus" AND available_at <= now()
         ORDER BY created_at
         LIMIT ${limit}
         FOR UPDATE SKIP LOCKED`;
      let published = 0;
      for (const e of events) {
        try {
          await publisher.publish(e);
          await tx.outboxEvent.update({ where: { id: e.id }, data: { status: "PUBLISHED", publishedAt: new Date(), attempts: e.attempts + 1 } });
          published++;
        } catch (err) {
          const attempts = e.attempts + 1;
          await tx.outboxEvent.update({
            where: { id: e.id },
            data: {
              attempts,
              status: attempts >= MAX_OUTBOX_ATTEMPTS ? "FAILED" : "PENDING",
              availableAt: new Date(Date.now() + Math.min(2 ** attempts * 1000, 5 * 60_000)),
              lastError: (err instanceof Error ? err.message : String(err)).slice(0, 500),
            },
          });
        }
      }
      return published;
    },
    { timeout: 30_000 },
  );
}

/** Moves due SCHEDULED campaigns to QUEUED and writes their dispatch event in the same transaction. */
export async function promoteScheduledCampaigns(prisma: PrismaClient): Promise<number> {
  const due = await prisma.campaign.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    select: { id: true },
    take: 100,
  });
  let promoted = 0;
  for (const c of due) {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.campaign.updateMany({ where: { id: c.id, status: "SCHEDULED" }, data: { status: "QUEUED" } });
      if (count === 1) {
        await tx.outboxEvent.create({ data: { type: OUTBOX_CAMPAIGN_DISPATCH, payload: { campaignId: c.id } } });
        promoted++;
      }
    });
  }
  return promoted;
}

/**
 * Resolves recipients stuck in PROCESSING after a worker crash:
 * - an attempt was started but never finished → the message may have gone out → UNKNOWN (no resend);
 * - no attempt was started → nothing was sent → back to PENDING.
 */
export async function recoverStuckRecipients(prisma: PrismaClient, staleAfterMs = 5 * 60_000): Promise<{ unknown: number; requeued: number }> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  return prisma.$transaction(async (tx) => {
    const unknown = await tx.$executeRaw`
      WITH stuck AS (
        SELECT r.id FROM campaign_recipients r
         WHERE r.status = 'PROCESSING'::"RecipientStatus" AND r.locked_at < ${cutoff}
           AND EXISTS (SELECT 1 FROM message_attempts a WHERE a.recipient_id = r.id AND a.finished_at IS NULL)
         FOR UPDATE SKIP LOCKED),
      closed AS (
        UPDATE message_attempts a SET outcome = 'UNKNOWN'::"AttemptOutcome", finished_at = now(),
               error_code = 'WORKER_INTERRUPTED', error_message = 'پردازش ارسال قطع شد؛ نتیجه نامشخص است.'
         WHERE a.recipient_id IN (SELECT id FROM stuck) AND a.finished_at IS NULL)
      UPDATE campaign_recipients r SET status = 'UNKNOWN'::"RecipientStatus", locked_at = NULL, updated_at = now(),
             last_error_code = 'WORKER_INTERRUPTED', last_error_message = 'پردازش ارسال قطع شد؛ نتیجه نامشخص است.'
       WHERE r.id IN (SELECT id FROM stuck)`;
    const requeued = await tx.$executeRaw`
      UPDATE campaign_recipients r SET status = 'PENDING'::"RecipientStatus", locked_at = NULL, updated_at = now()
       WHERE r.status = 'PROCESSING'::"RecipientStatus" AND r.locked_at < ${cutoff}
         AND NOT EXISTS (SELECT 1 FROM message_attempts a WHERE a.recipient_id = r.id AND a.finished_at IS NULL)`;
    return { unknown, requeued };
  });
}

/** Active campaigns that have due work; used to re-kick runs whose job was lost. */
export async function campaignsNeedingDispatch(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT c.id FROM campaigns c
     WHERE c.status IN ('QUEUED'::"CampaignStatus", 'RUNNING'::"CampaignStatus")
       AND (EXISTS (SELECT 1 FROM campaign_recipients r
                     WHERE r.campaign_id = c.id AND r.status = 'PENDING'::"RecipientStatus" AND r.next_attempt_at <= now())
            OR NOT EXISTS (SELECT 1 FROM campaign_recipients r
                     WHERE r.campaign_id = c.id AND r.status IN ('PENDING'::"RecipientStatus", 'PROCESSING'::"RecipientStatus")))
     LIMIT 500`;
  return rows.map((r) => r.id);
}
