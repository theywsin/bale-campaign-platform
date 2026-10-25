import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { OrgPermission, PlatformPermission } from "@bcp/shared";
import type { AppRequest, AuthUser, OrgContext } from "../request-context";
import { AppException } from "../errors";

export const ORG_PERMISSION_KEY = "orgPermission";
export const PLATFORM_PERMISSION_KEY = "platformPermission";
export const SKIP_CSRF_KEY = "skipCsrf";

/**
 * Requires membership in the organization named by the `:orgId` route
 * parameter, with a role that grants `permission`.
 */
export const RequireOrgPermission = (permission: OrgPermission) => SetMetadata(ORG_PERMISSION_KEY, permission);

/** Requires a platform (staff) role that grants `permission`. */
export const RequirePlatformPermission = (permission: PlatformPermission) =>
  SetMetadata(PLATFORM_PERMISSION_KEY, permission);

/** Disables the CSRF check for a state-changing route (only for non-cookie callers such as webhooks). */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.auth) throw AppException.unauthenticated();
  return req.auth.user;
});

export const CurrentSessionId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.auth) throw AppException.unauthenticated();
  return req.auth.session.id;
});

export const CurrentOrg = createParamDecorator((_: unknown, ctx: ExecutionContext): OrgContext => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.org) throw AppException.forbidden();
  return req.org;
});
