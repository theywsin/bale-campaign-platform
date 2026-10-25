import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { adminUpdateUserStatusSchema, paginationQuerySchema, type Paginated } from "@bcp/shared";
import type { Prisma } from "@bcp/database";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CurrentUser, RequirePlatformPermission } from "../common/decorators/auth.decorators";
import { ApiPaginationQuery, ApiZodBody, ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AppRequest, AuthUser, clientInfo } from "../common/request-context";
import { AppException } from "../common/errors";

const auditQuerySchema = paginationQuerySchema.extend({
  category: z.enum(["SECURITY", "ORGANIZATION", "ADMIN", "BILLING", "CAMPAIGN"]).optional(),
});

type PageQuery = z.infer<typeof paginationQuerySchema>;

@ApiTags("admin")
@Controller({ path: "admin", version: "1" })
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get("stats")
  @RequirePlatformPermission("admin:dashboard")
  async stats() {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const db = this.prisma.client;
    const [users, suspendedUsers, newUsers7d, organizations, activeSessions, failedLogins24h] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { status: "SUSPENDED" } }),
      db.user.count({ where: { createdAt: { gte: since } } }),
      db.organization.count({ where: { status: { not: "ARCHIVED" } } }),
      db.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
      db.auditLog.count({ where: { action: "auth.login.failed", createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } }),
    ]);
    return { users, suspendedUsers, newUsers7d, organizations, activeSessions, failedLogins24h };
  }

  @Get("users")
  @RequirePlatformPermission("admin:users:read")
  @ApiPaginationQuery()
  async users(@Query(new ZodValidationPipe(paginationQuerySchema)) q: PageQuery): Promise<Paginated<unknown>> {
    const where: Prisma.UserWhereInput = q.q
      ? { OR: [{ email: { contains: q.q, mode: "insensitive" } }, { fullName: { contains: q.q, mode: "insensitive" } }] }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.client.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          email: true,
          fullName: true,
          status: true,
          platformRole: true,
          emailVerifiedAt: true,
          lastLoginAt: true,
          createdAt: true,
          _count: { select: { memberships: true } },
        },
      }),
      this.prisma.client.user.count({ where }),
    ]);
    return {
      items: items.map(({ _count, ...u }) => ({ ...u, organizationCount: _count.memberships })),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  @Patch("users/:userId/status")
  @RequirePlatformPermission("admin:users:write")
  @ApiZodBody(adminUpdateUserStatusSchema)
  async setUserStatus(
    @CurrentUser() actor: AuthUser,
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Body(new ZodValidationPipe(adminUpdateUserStatusSchema)) body: z.infer<typeof adminUpdateUserStatusSchema>,
    @Req() req: AppRequest,
  ) {
    if (userId === actor.id) throw AppException.forbidden("نمی‌توانید وضعیت حساب خودتان را تغییر دهید.");
    const target = await this.prisma.client.user.findUnique({ where: { id: userId }, select: { id: true, status: true, platformRole: true } });
    if (!target) throw AppException.notFound("کاربر یافت نشد.");
    if (target.platformRole === "SUPER_ADMIN" && actor.platformRole !== "SUPER_ADMIN") throw AppException.forbidden();
    await this.prisma.client.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { status: body.status } });
      if (body.status === "SUSPENDED") {
        await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await this.audit.recordTx(tx, {
        category: "ADMIN",
        action: "admin.user.status_changed",
        actorUserId: actor.id,
        targetType: "user",
        targetId: userId,
        client: clientInfo(req),
        metadata: { from: target.status, to: body.status },
      });
    });
    return { id: userId, status: body.status };
  }

  @Get("organizations")
  @RequirePlatformPermission("admin:orgs:read")
  @ApiPaginationQuery()
  async organizations(@Query(new ZodValidationPipe(paginationQuerySchema)) q: PageQuery): Promise<Paginated<unknown>> {
    const where: Prisma.OrganizationWhereInput = q.q
      ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { slug: { contains: q.q, mode: "insensitive" } }] }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.client.organization.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
          createdBy: { select: { email: true } },
          _count: { select: { members: true } },
        },
      }),
      this.prisma.client.organization.count({ where }),
    ]);
    return {
      items: items.map(({ _count, createdBy, ...o }) => ({ ...o, ownerEmail: createdBy?.email ?? null, memberCount: _count.members })),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  @Get("audit-logs")
  @RequirePlatformPermission("admin:audit:read")
  @ApiPaginationQuery()
  async auditLogs(@Query(new ZodValidationPipe(auditQuerySchema)) q: z.infer<typeof auditQuerySchema>): Promise<Paginated<unknown>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.category ? { category: q.category } : {}),
      ...(q.q ? { action: { contains: q.q, mode: "insensitive" } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.client.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          category: true,
          action: true,
          actorUserId: true,
          organizationId: true,
          targetType: true,
          targetId: true,
          ipAddress: true,
          metadata: true,
          createdAt: true,
        },
      }),
      this.prisma.client.auditLog.count({ where }),
    ]);
    const actorIds = [...new Set(items.map((i) => i.actorUserId).filter((v): v is string => v !== null))];
    const actors = await this.prisma.client.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } });
    const emails = new Map(actors.map((a) => [a.id, a.email]));
    return {
      items: items.map((i) => ({ ...i, actorEmail: i.actorUserId ? (emails.get(i.actorUserId) ?? null) : null })),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }
}
