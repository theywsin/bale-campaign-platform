import { createHash } from "node:crypto";
import { MessagingError, type MessagingProvider, type SendTextRequest, type SendTextResult } from "./provider";

/**
 * TEST ONLY. Never contacts a real service; nothing is delivered to anyone.
 * Behaviour is deterministic by the last digits of the chat id so tests and
 * demos can exercise every path:
 *   …991  → permanent failure
 *   …992  → retryable failure on the first attempt (succeeds on retry)
 *   …993  → timeout (unknown outcome)
 *   …994  → rate limited (429) on the first attempt with Retry-After 1s
 *   other → accepted (never "delivered": the mock gives no delivery receipt)
 */
export class MockMessagingProvider implements MessagingProvider {
  readonly type = "MOCK" as const;
  private readonly seen = new Map<string, number>();

  constructor(private readonly latencyMs = 0) {}

  async sendText(req: SendTextRequest): Promise<SendTextResult> {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
    const tries = (this.seen.get(req.chatId) ?? 0) + 1;
    this.seen.set(req.chatId, tries);
    const firstTry = !/:a([2-9]|\d{2,})$/.test(req.idempotencyKey) && tries === 1;

    if (req.chatId.endsWith("991")) throw new MessagingError("PERMANENT", "MOCK_REJECTED", "گیرنده آزمایشی رد شد (Mock).");
    if (req.chatId.endsWith("992") && firstTry) {
      throw new MessagingError("RETRYABLE", "MOCK_TEMPORARY", "خطای موقت آزمایشی (Mock).");
    }
    if (req.chatId.endsWith("993")) {
      throw new MessagingError("UNKNOWN_OUTCOME", "TIMEOUT", "مهلت پاسخ آزمایشی تمام شد (Mock).");
    }
    if (req.chatId.endsWith("994") && firstTry) {
      throw new MessagingError("RETRYABLE", "RATE_LIMITED", "محدودیت نرخ آزمایشی (Mock).", 1000);
    }
    const id = createHash("sha256").update(req.idempotencyKey).digest("hex").slice(0, 16);
    return { providerMessageId: `mock-${id}`, deliveryConfirmed: false };
  }
}
