import { MessagingError, normalizeHttpFailure, type MessagingProvider, type SendTextRequest, type SendTextResult } from "./provider";

/** Official Bale Bot API base (https://docs.bale.ai/). Overridable only by the operator's env, never by users. */
export const BALE_API_DEFAULT_BASE_URL = "https://tapi.bale.ai";

/** Loose shape check so a token can never inject path segments or whitespace into the URL. */
export function isPlausibleBotToken(token: string): boolean {
  return /^[A-Za-z0-9:_-]{10,200}$/.test(token);
}

interface BaleResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
}

export interface BaleBotInfo {
  id: number;
  username?: string;
  first_name?: string;
}

const CONNECT_ERRORS = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT"]);

/**
 * Bale Bot API client limited to documented methods: getMe and sendMessage.
 * Bale gives no delivery receipts, so results are never `deliveryConfirmed`.
 * The token is part of the URL; it is never put in errors or logs.
 */
export class BaleBotProvider implements MessagingProvider {
  readonly type = "BALE_BOT" as const;

  constructor(
    private readonly token: string,
    private readonly baseUrl: string = BALE_API_DEFAULT_BASE_URL,
    private readonly timeoutMs = 20_000,
  ) {
    if (!isPlausibleBotToken(token)) throw new MessagingError("PERMANENT", "INVALID_TOKEN", "قالب توکن بازو معتبر نیست.");
  }

  private async call<T>(method: string, body: object | undefined, signal?: AbortSignal): Promise<T> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/bot${this.token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        redirect: "error",
      });
    } catch (err) {
      const code = (err as { cause?: { code?: string } }).cause?.code;
      throw normalizeHttpFailure({ networkPhase: code && CONNECT_ERRORS.has(code) ? "connect" : "after-send" });
    }
    let data: BaleResponse<T> | null = null;
    try {
      data = (await res.json()) as BaleResponse<T>;
    } catch {
      // The request reached the server; a non-JSON body leaves the outcome unknown unless the status says otherwise.
    }
    if (res.ok && data?.ok && data.result !== undefined) return data.result;
    const status = data?.error_code ?? (res.ok ? 0 : res.status);
    throw normalizeHttpFailure({ status, retryAfterSeconds: data?.parameters?.retry_after, description: data?.description });
  }

  getMe(signal?: AbortSignal): Promise<BaleBotInfo> {
    return this.call<BaleBotInfo>("getMe", undefined, signal);
  }

  async sendText(req: SendTextRequest, signal?: AbortSignal): Promise<SendTextResult> {
    const result = await this.call<{ message_id: number }>("sendMessage", { chat_id: req.chatId, text: req.text }, signal);
    return { providerMessageId: String(result.message_id), deliveryConfirmed: false };
  }
}
