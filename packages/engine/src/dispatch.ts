import type { PrismaClient } from "@bcp/database";
import { MessagingError, toMessagingError, type MessagingProvider } from "@bcp/messaging";
import { decideRetry, DEFAULT_RETRY_POLICY, type RetryPolicy } from "@bcp/shared";
import type { Redis } from "ioredis";
import { acquireLock, reserveSendSlot } from "./lock";

export interface EngineLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export interface AccountForSend {
  id: string;
  provider: "MOCK" | "BALE_BOT";
  status: "ACTIVE" | "DISABLED";
  credentialsEncrypted: string | null;
  rateLimitPerMinute: number;
}

export interface DispatchDeps {
  prisma: PrismaClient;
  redis: Redis;
  log: EngineLogger;
  /** Returns a provider, or a Persian reason why this account cannot send. */
  providerFor(account: AccountForSend): MessagingProvider | { unavailable: string };
  /** Schedules another dispatch run for this campaign after `delayMs`. */
  enqueue(campaignId: string, delayMs: number): Promise<void>;
  retryPolicy?: RetryPolicy;
  batchSize?: number;
  sendTimeoutMs?: number;
}

export type DispatchResult =
  | { outcome: "locked" | "not-runnable" | "paused" | "cancelled" | "lost-lock" }
  | { outcome: "failed"; reason: string }
  | { outcome: "completed"; sent: number }
  | { outcome: "waiting"; sent: number; nextInMs: number };

interface ClaimedRow {
  id: string;
  chat_id: string | null;
  contact_id: string | null;
  attempt_count: number;
}

const LOCK_TTL_MS = 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new MessagingError("UNKNOWN_OUTCOME", "TIMEOUT", "مهلت پاسخ سرویس پیام‌رسان تمام شد؛ نتیجه ارسال نامشخص است.")),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Sends the due recipients of one campaign. Safe under at-least-once job
 * delivery: a per-campaign Redis lock serializes runs, recipients are claimed
 * with FOR UPDATE SKIP LOCKED, and an attempt row is written before each
 * provider call so a crash mid-send ends in UNKNOWN, never in a blind resend.
 */
export async function dispatchCampaign(deps: DispatchDeps, campaignId: string): Promise<DispatchResult> {
  const { prisma, redis, log } = deps;
  const policy = deps.retryPolicy ?? DEFAULT_RETRY_POLICY;
  const batchSize = deps.batchSize ?? 20;
  const timeoutMs = deps.sendTimeoutMs ?? 30_000;

  const lock = await acquireLock(redis, `bcp:lock:campaign:${campaignId}`, LOCK_TTL_MS);
  if (!lock) return { outcome: "locked" };
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, status: true, messageText: true, organizationId: true, messagingAccount: true },
    });
    if (!campaign || (campaign.status !== "QUEUED" && campaign.status !== "RUNNING")) return { outcome: "not-runnable" };

    const account = campaign.messagingAccount;
    const provider = !account
      ? { unavailable: "حساب ارسال کمپین حذف شده است." }
      : account.status !== "ACTIVE"
        ? { unavailable: "حساب ارسال غیرفعال است." }
        : deps.providerFor(account);
    if ("unavailable" in provider) {
      await failCampaign(prisma, campaignId, provider.unavailable);
      log.warn({ campaignId }, "campaign failed: provider unavailable");
      return { outcome: "failed", reason: provider.unavailable };
    }

    if (campaign.status === "QUEUED") {
      await prisma.campaign.updateMany({ where: { id: campaignId, status: "QUEUED" }, data: { status: "RUNNING", startedAt: new Date() } });
    }

    let sent = 0;
    for (;;) {
      if (!lock.held()) return { outcome: "lost-lock" };
      const claimed = await prisma.$queryRaw<ClaimedRow[]>`
        UPDATE campaign_recipients r
           SET status = 'PROCESSING'::"RecipientStatus", locked_at = now(), updated_at = now()
         WHERE r.id IN (
           SELECT id FROM campaign_recipients
            WHERE campaign_id = ${campaignId}::uuid AND status = 'PENDING'::"RecipientStatus" AND next_attempt_at <= now()
            ORDER BY next_attempt_at, id
            LIMIT ${batchSize}
            FOR UPDATE SKIP LOCKED)
        RETURNING r.id, r.chat_id, r.contact_id, r.attempt_count`;
      if (claimed.length === 0) break;

      const blocked = await suppressedIds(prisma, campaign.organizationId, claimed);
      for (let i = 0; i < claimed.length; i++) {
        const row = claimed[i]!;
        const status = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
        if (status?.status !== "RUNNING") {
          // Paused or cancelled: hand back everything not yet sent.
          await releaseClaims(prisma, claimed.slice(i).map((r) => r.id), status?.status === "CANCELLED");
          return { outcome: status?.status === "CANCELLED" ? "cancelled" : "paused" };
        }
        if (blocked.has(row.id) || !row.chat_id) {
          await prisma.campaignRecipient.update({
            where: { id: row.id },
            data: blocked.has(row.id)
              ? { status: "SUPPRESSED", lockedAt: null, lastErrorCode: "SUPPRESSED", lastErrorMessage: "در فهرست مستثنا یا انصراف‌داده." }
              : { status: "FAILED", lockedAt: null, lastErrorCode: "NO_CHAT_ID", lastErrorMessage: "شناسه چت بله ندارد." },
          });
          continue;
        }

        const wait = await reserveSendSlot(redis, account!.id, account!.rateLimitPerMinute);
        if (wait > 0) await sleep(wait);

        const attemptNo = row.attempt_count + 1;
        const attempt = await prisma.$transaction(async (tx) => {
          await tx.campaignRecipient.update({ where: { id: row.id }, data: { attemptCount: attemptNo } });
          return tx.messageAttempt.create({ data: { recipientId: row.id, attemptNo } });
        });

        try {
          const result = await withTimeout(
            provider.sendText(
              { chatId: row.chat_id, text: campaign.messageText, idempotencyKey: `${row.id}:a${attemptNo}` },
              AbortSignal.timeout(timeoutMs),
            ),
            timeoutMs + 1000,
          );
          const now = new Date();
          await prisma.$transaction([
            prisma.messageAttempt.update({
              where: { id: attempt.id },
              data: { outcome: "ACCEPTED", providerMessageId: result.providerMessageId, finishedAt: now },
            }),
            prisma.campaignRecipient.update({
              where: { id: row.id },
              data: {
                status: result.deliveryConfirmed ? "DELIVERED" : "ACCEPTED",
                providerMessageId: result.providerMessageId,
                acceptedAt: now,
                deliveredAt: result.deliveryConfirmed ? now : null,
                lockedAt: null,
                lastErrorCode: null,
                lastErrorMessage: null,
              },
            }),
          ]);
          sent++;
        } catch (thrown) {
          const err = toMessagingError(thrown);
          const decision = decideRetry(err.kind, attemptNo, policy, err.retryAfterMs);
          const outcome = err.kind === "UNKNOWN_OUTCOME" ? "UNKNOWN" : err.kind === "RETRYABLE" ? "FAILED_RETRYABLE" : "FAILED_PERMANENT";
          const message = err.message.slice(0, 300);
          await prisma.$transaction([
            prisma.messageAttempt.update({
              where: { id: attempt.id },
              data: { outcome, errorCode: err.code.slice(0, 50), errorMessage: message, finishedAt: new Date() },
            }),
            prisma.campaignRecipient.update({
              where: { id: row.id },
              data: {
                status: decision.action === "retry" ? "PENDING" : decision.action === "unknown" ? "UNKNOWN" : "FAILED",
                nextAttemptAt: decision.action === "retry" ? new Date(Date.now() + decision.delayMs) : undefined,
                lockedAt: null,
                lastErrorCode: err.code.slice(0, 50),
                lastErrorMessage: message,
              },
            }),
          ]);
          if (err.code === "RATE_LIMITED" && err.retryAfterMs) await sleep(Math.min(err.retryAfterMs, 60_000));
        }
      }
    }

    // Nothing due right now: finish, or come back when the next retry is due.
    const next = await prisma.campaignRecipient.findFirst({
      where: { campaignId, status: { in: ["PENDING", "PROCESSING"] } },
      orderBy: { nextAttemptAt: "asc" },
      select: { status: true, nextAttemptAt: true },
    });
    if (!next) {
      await prisma.campaign.updateMany({ where: { id: campaignId, status: "RUNNING" }, data: { status: "COMPLETED", finishedAt: new Date() } });
      log.info({ campaignId, sent }, "campaign completed");
      return { outcome: "completed", sent };
    }
    // PROCESSING rows belong to a crashed run; recovery resolves them and kicks the campaign again.
    const nextInMs = next.status === "PENDING" ? Math.max(1000, next.nextAttemptAt.getTime() - Date.now()) : 60_000;
    await deps.enqueue(campaignId, nextInMs);
    return { outcome: "waiting", sent, nextInMs };
  } finally {
    await lock.release();
  }
}

async function suppressedIds(prisma: PrismaClient, organizationId: string, rows: ClaimedRow[]): Promise<Set<string>> {
  const ids = rows.map((r) => r.id);
  const hits = await prisma.$queryRaw<{ id: string }[]>`
    SELECT r.id FROM campaign_recipients r
      LEFT JOIN contacts c ON c.id = r.contact_id
     WHERE r.id = ANY(${ids}::uuid[])
       AND (c.consent = 'OPTED_OUT'::"ConsentStatus"
            OR EXISTS (SELECT 1 FROM suppression_entries s
                        WHERE s.organization_id = ${organizationId}::uuid
                          AND ((s.kind = 'BALE_CHAT_ID'::"SuppressionKind" AND s.value = r.chat_id)
                            OR (s.kind = 'PHONE'::"SuppressionKind" AND s.value = c.phone))))`;
  return new Set(hits.map((h) => h.id));
}

async function releaseClaims(prisma: PrismaClient, ids: string[], cancelled: boolean): Promise<void> {
  await prisma.campaignRecipient.updateMany({
    where: { id: { in: ids }, status: "PROCESSING" },
    data: cancelled
      ? { status: "FAILED", lockedAt: null, lastErrorCode: "CAMPAIGN_CANCELLED", lastErrorMessage: "کمپین لغو شد." }
      : { status: "PENDING", lockedAt: null },
  });
}

export async function failCampaign(prisma: PrismaClient, campaignId: string, reason: string): Promise<void> {
  await prisma.$transaction([
    prisma.campaign.updateMany({
      where: { id: campaignId, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "FAILED", failureReason: reason.slice(0, 300), finishedAt: new Date() },
    }),
    prisma.campaignRecipient.updateMany({
      where: { campaignId, status: "PENDING" },
      data: { status: "FAILED", lastErrorCode: "CAMPAIGN_FAILED", lastErrorMessage: reason.slice(0, 300) },
    }),
  ]);
}
