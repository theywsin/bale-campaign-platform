/** Campaign and recipient state machines, and the retry policy used by the worker. */

export const CAMPAIGN_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "QUEUED",
  "RUNNING",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS_FA: Record<CampaignStatus, string> = {
  DRAFT: "پیش‌نویس",
  SCHEDULED: "زمان‌بندی‌شده",
  QUEUED: "در صف",
  RUNNING: "در حال ارسال",
  PAUSED: "متوقف‌شده",
  COMPLETED: "پایان‌یافته",
  CANCELLED: "لغوشده",
  FAILED: "ناموفق",
};

const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
  DRAFT: ["SCHEDULED", "QUEUED", "CANCELLED"],
  SCHEDULED: ["QUEUED", "PAUSED", "CANCELLED"],
  QUEUED: ["RUNNING", "PAUSED", "CANCELLED", "COMPLETED", "FAILED"],
  RUNNING: ["PAUSED", "COMPLETED", "CANCELLED", "FAILED"],
  PAUSED: ["QUEUED", "SCHEDULED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  FAILED: [],
};

export function canTransitionCampaign(from: CampaignStatus, to: CampaignStatus): boolean {
  return CAMPAIGN_TRANSITIONS[from].includes(to);
}

/** States from which the given transition is allowed (used to build guarded SQL updates). */
export function campaignStatesAllowing(to: CampaignStatus): CampaignStatus[] {
  return CAMPAIGN_STATUSES.filter((s) => CAMPAIGN_TRANSITIONS[s].includes(to));
}

export function isCampaignTerminal(status: CampaignStatus): boolean {
  return CAMPAIGN_TRANSITIONS[status].length === 0;
}

/** Only drafts may be edited or deleted. */
export function isCampaignEditable(status: CampaignStatus): boolean {
  return status === "DRAFT";
}

export const RECIPIENT_STATUSES = [
  "PENDING",
  "PROCESSING",
  "ACCEPTED",
  "DELIVERED",
  "FAILED",
  "UNKNOWN",
  "SUPPRESSED",
] as const;
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number];

export const RECIPIENT_STATUS_LABELS_FA: Record<RecipientStatus, string> = {
  PENDING: "در انتظار",
  PROCESSING: "در حال پردازش",
  ACCEPTED: "پذیرفته‌شده توسط سرویس",
  DELIVERED: "تحویل‌شده (تأییدشده)",
  FAILED: "ناموفق",
  UNKNOWN: "نامشخص",
  SUPPRESSED: "مستثنا",
};

const RECIPIENT_TRANSITIONS: Record<RecipientStatus, readonly RecipientStatus[]> = {
  PENDING: ["PROCESSING", "SUPPRESSED", "FAILED"],
  // PENDING again = scheduled retry, or recovery of a claim that never reached the provider.
  PROCESSING: ["ACCEPTED", "FAILED", "UNKNOWN", "PENDING"],
  // DELIVERED requires an explicit delivery confirmation from the provider.
  ACCEPTED: ["DELIVERED"],
  DELIVERED: [],
  FAILED: [],
  UNKNOWN: [],
  SUPPRESSED: [],
};

export function canTransitionRecipient(from: RecipientStatus, to: RecipientStatus): boolean {
  return RECIPIENT_TRANSITIONS[from].includes(to);
}

/** Error classes after normalization by the messaging provider. */
export type SendErrorKind = "RETRYABLE" | "PERMANENT" | "UNKNOWN_OUTCOME";

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = { maxAttempts: 4, baseDelayMs: 30_000, maxDelayMs: 15 * 60_000 };

export type RetryDecision =
  | { action: "retry"; delayMs: number }
  | { action: "fail" }
  /** The message may have been sent: never resend automatically. */
  | { action: "unknown" };

/**
 * Decides what happens after a failed attempt. `attemptNo` counts from 1.
 * `retryAfterMs` (e.g. from HTTP 429) wins over the backoff when it is larger.
 */
export function decideRetry(
  kind: SendErrorKind,
  attemptNo: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  retryAfterMs?: number,
): RetryDecision {
  if (kind === "UNKNOWN_OUTCOME") return { action: "unknown" };
  if (kind === "PERMANENT" || attemptNo >= policy.maxAttempts) return { action: "fail" };
  const backoff = Math.min(policy.baseDelayMs * 2 ** (attemptNo - 1), policy.maxDelayMs);
  return { action: "retry", delayMs: Math.max(backoff, Math.min(retryAfterMs ?? 0, policy.maxDelayMs)) };
}

/** BullMQ queue that carries campaign dispatch jobs (`{ campaignId }`). */
export const CAMPAIGN_QUEUE = "campaigns";
/** Outbox event type that requests a dispatch run for a campaign. */
export const OUTBOX_CAMPAIGN_DISPATCH = "campaign.dispatch";
