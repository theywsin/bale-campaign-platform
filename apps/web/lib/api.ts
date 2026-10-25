import type { ApiErrorBody } from "@bcp/shared";

export const CSRF_COOKIE = "bcp_csrf";
export const CSRF_HEADER = "X-CSRF-Token";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * Calls the API on the same origin. The session lives in an httpOnly cookie;
 * state-changing requests echo the CSRF cookie in a header (double submit).
 */
export async function api<T>(path: string, options: { method?: Method; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers[CSRF_HEADER] = csrf;
  }

  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: options.signal,
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.");
  }

  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const body = (data ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError(
      res.status,
      body.code ?? "UNKNOWN",
      body.message ?? "خطای غیرمنتظره رخ داد. لطفاً دوباره تلاش کنید.",
      body.fieldErrors,
    );
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "خطای غیرمنتظره رخ داد. لطفاً دوباره تلاش کنید.";
}
