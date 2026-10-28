import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { API_ENV, type ApiEnv } from "../../config/env";
import { Reflector } from "@nestjs/core";
import {
  isOrganizationRole,
  orgRoleHasPermission,
  platformRoleHasPermission,
  type OrgPermission,
  type PlatformPermission,
} from "@bcp/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { ORG_PERMISSION_KEY, PLATFORM_PERMISSION_KEY } from "../decorators/auth.decorators";
import { AppException } from "../errors";
import type { AppRequest } from "../request-context";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tenant isolation: resolves `:orgId` to the caller's membership. Non-members
 * get 404 (not 403) so the existence of other tenants is not revealed.
 * Services must scope every query by `req.org.organizationId`.
 */
@Injectable()
export class OrgPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<OrgPermission | undefined>(ORG_PERMISSION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!permission) return true;

    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (!req.auth) throw AppException.unauthenticated();
    const orgId = req.params?.orgId;
    if (typeof orgId !== "string" || !UUID_RE.test(orgId)) throw AppException.notFound("فضای کاری یافت نشد.");

    const membership = await this.prisma.client.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: req.auth.user.id } },
      select: { id: true, role: true, organization: { select: { status: true } } },
    });
    if (!membership || membership.organization.status === "ARCHIVED" || !isOrganizationRole(membership.role)) {
      throw AppException.notFound("فضای کاری یافت نشد.");
    }
    if (membership.organization.status === "SUSPENDED") {
      throw AppException.forbidden("این فضای کاری تعلیق شده است. با پشتیبانی تماس بگیرید.");
    }
    if (!orgRoleHasPermission(membership.role, permission)) throw AppException.forbidden();

    req.org = { organizationId: orgId, memberId: membership.id, role: membership.role };
    return true;
  }
}

@Injectable()
export class PlatformPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<PlatformPermission | undefined>(PLATFORM_PERMISSION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!permission) return true;
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (!req.auth) throw AppException.unauthenticated();
    if (!platformRoleHasPermission(req.auth.user.platformRole, permission)) throw AppException.forbidden();
    if (this.env.ADMIN_MFA_REQUIRED && !req.auth.user.mfaEnabled) {
      throw new AppException(HttpStatus.FORBIDDEN, "MFA_REQUIRED", "برای استفاده از پنل مدیریت، ابتدا ورود دومرحله‌ای را در «پروفایل و امنیت» فعال کنید.");
    }
    return true;
  }
}
