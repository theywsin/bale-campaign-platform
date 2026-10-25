import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { allowedOrigins, API_ENV, ApiEnv } from "../../config/env";
import { SKIP_CSRF_KEY } from "../decorators/auth.decorators";
import { AppException } from "../errors";
import type { AppRequest } from "../request-context";
import { CSRF_COOKIE, CSRF_HEADER } from "../security/cookies";
import { safeEqual } from "../security/tokens";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF protection for cookie-authenticated requests:
 *  1. Origin (or Referer) must be one of the allowed origins when present.
 *  2. The X-CSRF-Token header must equal the bcp_csrf cookie (double submit).
 * Combined with SameSite=Lax session cookies.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly origins: Set<string>;

  constructor(
    private readonly reflector: Reflector,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.origins = new Set(allowedOrigins(env));
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (SAFE_METHODS.has(req.method)) return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [ctx.getHandler(), ctx.getClass()])) return true;

    const reject = () => new AppException(HttpStatus.FORBIDDEN, "CSRF_REJECTED", "درخواست نامعتبر است. صفحه را دوباره بارگذاری کنید.");

    const origin = req.headers.origin ?? refererOrigin(req.headers.referer);
    if (origin && !this.origins.has(origin)) throw reject();

    const cookie: unknown = req.cookies?.[CSRF_COOKIE];
    const header = req.headers[CSRF_HEADER];
    if (typeof cookie !== "string" || typeof header !== "string" || cookie.length < 16 || !safeEqual(cookie, header)) {
      throw reject();
    }
    return true;
  }
}

function refererOrigin(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return "invalid";
  }
}
