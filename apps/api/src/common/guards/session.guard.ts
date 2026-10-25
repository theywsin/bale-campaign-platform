import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { AppException } from "../errors";
import type { AppRequest } from "../request-context";
import { SESSION_COOKIE } from "../security/cookies";
import { SessionService } from "../../auth/session.service";

/**
 * Global guard: every route requires a valid session unless marked @Public().
 * On public routes a valid session is still attached when present.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === "string" && token) {
      const result = await this.sessions.validate(token);
      if (result) req.auth = { user: result.user, session: { id: result.sessionId } };
    }
    if (!isPublic && !req.auth) throw AppException.unauthenticated();
    return true;
  }
}
