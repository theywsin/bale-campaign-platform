import type { CookieOptions, Response } from "express";
import type { ApiEnv } from "../../config/env";

export const SESSION_COOKIE = "bcp_session";
export const CSRF_COOKIE = "bcp_csrf";
export const CSRF_HEADER = "x-csrf-token";

function base(env: ApiEnv): CookieOptions {
  return { secure: env.COOKIE_SECURE, sameSite: "lax", path: "/" };
}

export function setSessionCookie(res: Response, env: ApiEnv, token: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE, token, { ...base(env), httpOnly: true, expires: expiresAt });
}

export function clearSessionCookie(res: Response, env: ApiEnv): void {
  res.clearCookie(SESSION_COOKIE, { ...base(env), httpOnly: true });
}

/** The CSRF cookie must be readable by the web app's JavaScript (double-submit pattern). */
export function setCsrfCookie(res: Response, env: ApiEnv, token: string): void {
  res.cookie(CSRF_COOKIE, token, { ...base(env), httpOnly: false, maxAge: 1000 * 60 * 60 * 24 * 30 });
}
