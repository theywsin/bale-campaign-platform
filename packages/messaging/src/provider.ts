import type { SendErrorKind } from "@bcp/shared";

export interface SendTextRequest {
  chatId: string;
  text: string;
  /** Stable per recipient+attempt; providers that support idempotency should forward it. */
  idempotencyKey: string;
}

export interface SendTextResult {
  providerMessageId: string;
  /**
   * True only when the provider explicitly confirms delivery to the device.
   * Acceptance by the API is not delivery.
   */
  deliveryConfirmed: boolean;
}

/** Normalized provider error. Never put credentials or full request URLs in `message`. */
export class MessagingError extends Error {
  constructor(
    readonly kind: SendErrorKind,
    readonly code: string,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "MessagingError";
  }
}

export interface MessagingProvider {
  readonly type: "MOCK" | "BALE_BOT";
  /** Throws MessagingError on failure. */
  sendText(request: SendTextRequest, signal?: AbortSignal): Promise<SendTextResult>;
}

/**
 * Maps an HTTP-level outcome to an error kind.
 * - The request never left (DNS, connection refused): retryable, nothing was sent.
 * - Timeout or connection reset after sending, or 5xx: the message may have been sent → UNKNOWN_OUTCOME.
 * - 429: retryable, honour Retry-After.
 * - Other 4xx: permanent (bad chat id, bot blocked, invalid token...).
 */
export function normalizeHttpFailure(input: {
  status?: number;
  networkPhase?: "connect" | "after-send";
  retryAfterSeconds?: number;
  description?: string;
}): MessagingError {
  const detail = (input.description ?? "").slice(0, 200);
  if (input.networkPhase === "connect") {
    return new MessagingError("RETRYABLE", "NETWORK_CONNECT", "اتصال به سرویس پیام‌رسان برقرار نشد.");
  }
  if (input.networkPhase === "after-send") {
    return new MessagingError("UNKNOWN_OUTCOME", "TIMEOUT", "پاسخی از سرویس پیام‌رسان دریافت نشد؛ نتیجه ارسال نامشخص است.");
  }
  const status = input.status ?? 0;
  if (status === 429) {
    const ms = input.retryAfterSeconds && input.retryAfterSeconds > 0 ? input.retryAfterSeconds * 1000 : undefined;
    return new MessagingError("RETRYABLE", "RATE_LIMITED", "محدودیت نرخ سرویس پیام‌رسان.", ms);
  }
  if (status >= 500) {
    return new MessagingError("UNKNOWN_OUTCOME", `HTTP_${status}`, "خطای سرور سرویس پیام‌رسان؛ نتیجه ارسال نامشخص است.");
  }
  if (status === 401 || status === 403) {
    return new MessagingError("PERMANENT", "UNAUTHORIZED", "اعتبارنامه حساب پیام‌رسان معتبر نیست یا دسترسی ندارد.");
  }
  if (status >= 400) {
    return new MessagingError("PERMANENT", `HTTP_${status}`, detail || "درخواست توسط سرویس پیام‌رسان رد شد.");
  }
  return new MessagingError("UNKNOWN_OUTCOME", "UNEXPECTED", "پاسخ غیرمنتظره از سرویس پیام‌رسان.");
}

/** Converts anything thrown by a provider into a MessagingError (unknown errors are treated as UNKNOWN_OUTCOME). */
export function toMessagingError(err: unknown): MessagingError {
  if (err instanceof MessagingError) return err;
  return new MessagingError("UNKNOWN_OUTCOME", "INTERNAL", "خطای داخلی هنگام ارسال؛ نتیجه نامشخص است.");
}
