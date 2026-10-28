import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  adminSubscriptionSchema,
  billingListQuerySchema,
  createLicensesSchema,
  paginationQuerySchema,
  planInputSchema,
  platformRoleHasPermission,
  updatePlanSchema,
  type Paginated,
} from "@bcp/shared";
import { Prisma } from "@bcp/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CurrentUser, RequirePlatformPermission } from "../common/decorators/auth.decorators";
import { ApiPaginationQuery, ApiZodBody, ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AppRequest, AuthUser, clientInfo } from "../common/request-context";
import { AppException } from "../common/errors";
import { hashToken } from "../common/security/tokens";
import { BillingService, generateLicenseKey, toPlanInfo, toSubscriptionInfo } from "./billing.service";

type ListQuery = z.infer<typeof billingListQuerySchema>;
const uuid = new ParseUUIDPipe();
const page = (q: { page: number; pageSize: number }) => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });
const DAY_MS = 24 * 3600 * 1000;

function rethrowPlanConflict(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw AppException.conflict("پلنی با این کد وجود دارد.");
  throw err;
}

/** Only the last 4 characters of gateway references are shown without admin:payments:sensitive. */
function maskRef(ref: string, sensitive: boolean): string {
  return sensitive ? ref : `••••${ref.slice(-4)}`;
}

@ApiTags("admin-billing")
@Controller({ path: "admin", version: "1" })
export class AdminBillingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  @Get("billing/stats")
  @RequirePlatformPermission("admin:subscriptions:read")
  async stats(@CurrentUser() actor: AuthUser) {
    const now = new Date();
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const [activeSubscriptions, pendingOrders, availableLicenses] = await Promise.all([
      this.db.subscription.count({ where: { status: "ACTIVE", endsAt: { gt: now } } }),
      this.db.order.count({ where: { status: "PENDING" } }),
      this.db.license.count({ where: { status: "AVAILABLE" } }),
    ]);
    // Revenue is payment data: hidden from roles without admin:payments:read (e.g. SUPPORT).
    let revenue30dRials: string | null = null;
    if (platformRoleHasPermission(actor.platformRole, "admin:payments:read")) {
      const agg = await this.db.order.aggregate({ where: { status: "PAID", paidAt: { gte: since } }, _sum: { amountRials: true } });
      revenue30dRials = (agg._sum.amountRials ?? 0n).toString();
    }
    return { activeSubscriptions, pendingOrders, availableLicenses, revenue30dRials };
  }

  // ---- plans -------------------------------------------------------------------

  @Get("plans")
  @RequirePlatformPermission("admin:subscriptions:read")
  async plans() {
    const plans = await this.db.plan.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    const counts = await this.db.subscription.groupBy({ by: ["planId"], where: { status: "ACTIVE", endsAt: { gt: new Date() } }, _count: true });
    const byPlan = new Map(counts.map((c) => [c.planId, c._count]));
    return plans.map((p) => ({ ...toPlanInfo(p), activeSubscriptions: byPlan.get(p.id) ?? 0 }));
  }

  @Post("plans")
  @RequirePlatformPermission("admin:plans:write")
  @ApiZodBody(planInputSchema)
  async createPlan(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(planInputSchema)) body: z.infer<typeof planInputSchema>, @Req() req: AppRequest) {
    try {
      return await this.db.$transaction(async (tx) => {
        if (body.isDefault) await tx.plan.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        const p = await tx.plan.create({ data: { ...body, priceRials: BigInt(body.priceRials) } });
        await this.audit.recordTx(tx, { category: "BILLING", action: "admin.plan.created", actorUserId: actor.id, targetType: "plan", targetId: p.id, client: clientInfo(req), metadata: { code: p.code } });
        return toPlanInfo(p);
      });
    } catch (err) {
      rethrowPlanConflict(err);
    }
  }

  /** Price and period changes apply to new orders only; existing orders keep their snapshot. */
  @Patch("plans/:planId")
  @RequirePlatformPermission("admin:plans:write")
  @ApiZodBody(updatePlanSchema)
  async updatePlan(
    @CurrentUser() actor: AuthUser,
    @Param("planId", uuid) id: string,
    @Body(new ZodValidationPipe(updatePlanSchema)) body: z.infer<typeof updatePlanSchema>,
    @Req() req: AppRequest,
  ) {
    const existing = await this.db.plan.findUnique({ where: { id } });
    if (!existing) throw AppException.notFound("پلن یافت نشد.");
    return this.db.$transaction(async (tx) => {
      if (body.isDefault) await tx.plan.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
      const { priceRials, ...rest } = body;
      const p = await tx.plan.update({ where: { id }, data: { ...rest, ...(priceRials !== undefined ? { priceRials: BigInt(priceRials) } : {}) } });
      await this.audit.recordTx(tx, { category: "BILLING", action: "admin.plan.updated", actorUserId: actor.id, targetType: "plan", targetId: id, client: clientInfo(req), metadata: { fields: Object.keys(body) } });
      return toPlanInfo(p);
    });
  }

  // ---- subscriptions -------------------------------------------------------------

  @Get("subscriptions")
  @RequirePlatformPermission("admin:subscriptions:read")
  @ApiPaginationQuery()
  async subscriptions(@Query(new ZodValidationPipe(billingListQuerySchema)) q: ListQuery): Promise<Paginated<unknown>> {
    const status = q.status === "ACTIVE" || q.status === "EXPIRED" || q.status === "CANCELED" ? q.status : undefined;
    const where: Prisma.SubscriptionWhereInput = {
      ...(status ? { status } : {}),
      ...(q.q ? { organization: { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { slug: { contains: q.q, mode: "insensitive" } }] } } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.subscription.findMany({ where, include: { plan: true, organization: { select: { id: true, name: true, slug: true } } }, orderBy: { createdAt: "desc" }, ...page(q) }),
      this.db.subscription.count({ where }),
    ]);
    return { items: items.map((s) => ({ ...toSubscriptionInfo(s), organization: s.organization })), page: q.page, pageSize: q.pageSize, total };
  }

  @Post("organizations/:orgId/subscription")
  @RequirePlatformPermission("admin:subscriptions:write")
  @ApiZodBody(adminSubscriptionSchema)
  async grant(
    @CurrentUser() actor: AuthUser,
    @Param("orgId", uuid) orgId: string,
    @Body(new ZodValidationPipe(adminSubscriptionSchema)) body: z.infer<typeof adminSubscriptionSchema>,
    @Req() req: AppRequest,
  ) {
    const [org, plan] = await Promise.all([this.db.organization.findUnique({ where: { id: orgId } }), this.db.plan.findUnique({ where: { id: body.planId } })]);
    if (!org) throw AppException.notFound("سازمان یافت نشد.");
    if (!plan) throw AppException.notFound("پلن یافت نشد.");
    const id = await this.db.$transaction(async (tx) => {
      const subId = await this.billing.activate(tx, orgId, plan.id, body.periodDays, "ADMIN");
      await this.audit.recordTx(tx, { category: "BILLING", action: "admin.subscription.granted", actorUserId: actor.id, organizationId: orgId, targetType: "subscription", targetId: subId, client: clientInfo(req), metadata: { plan: plan.code, periodDays: body.periodDays } });
      return subId;
    });
    return toSubscriptionInfo(await this.db.subscription.findUniqueOrThrow({ where: { id }, include: { plan: true } }));
  }

  @Post("subscriptions/:subscriptionId/cancel")
  @RequirePlatformPermission("admin:subscriptions:write")
  @HttpCode(HttpStatus.OK)
  async cancel(@CurrentUser() actor: AuthUser, @Param("subscriptionId", uuid) id: string, @Req() req: AppRequest) {
    return this.db.$transaction(async (tx) => {
      const { count } = await tx.subscription.updateMany({ where: { id, status: "ACTIVE" }, data: { status: "CANCELED", canceledAt: new Date() } });
      if (count === 0) throw AppException.conflict("این اشتراک فعال نیست.");
      const s = await tx.subscription.findUniqueOrThrow({ where: { id }, include: { plan: true } });
      await this.audit.recordTx(tx, { category: "BILLING", action: "admin.subscription.canceled", actorUserId: actor.id, organizationId: s.organizationId, targetType: "subscription", targetId: id, client: clientInfo(req) });
      return toSubscriptionInfo(s);
    });
  }

  // ---- orders & payments -----------------------------------------------------------

  @Get("orders")
  @RequirePlatformPermission("admin:payments:read")
  @ApiPaginationQuery()
  async orders(@CurrentUser() actor: AuthUser, @Query(new ZodValidationPipe(billingListQuerySchema)) q: ListQuery): Promise<Paginated<unknown>> {
    const sensitive = platformRoleHasPermission(actor.platformRole, "admin:payments:sensitive");
    const status = q.status === "PENDING" || q.status === "PAID" || q.status === "FAILED" || q.status === "CANCELED" ? q.status : undefined;
    const where: Prisma.OrderWhereInput = {
      ...(status ? { status } : {}),
      ...(q.q ? { organization: { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { slug: { contains: q.q, mode: "insensitive" } }] } } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.order.findMany({
        where,
        include: {
          plan: { select: { id: true, name: true } },
          organization: { select: { id: true, name: true } },
          payments: { orderBy: { createdAt: "asc" }, include: { history: { orderBy: { createdAt: "asc" } } } },
        },
        orderBy: { createdAt: "desc" },
        ...page(q),
      }),
      this.db.order.count({ where }),
    ]);
    return {
      items: items.map((o) => ({
        id: o.id,
        organization: o.organization,
        plan: o.plan,
        amountRials: o.amountRials.toString(),
        status: o.status,
        paidAt: o.paidAt?.toISOString() ?? null,
        createdAt: o.createdAt.toISOString(),
        payments: o.payments.map((p) => ({
          id: p.id,
          provider: p.provider,
          providerRef: maskRef(p.providerRef, sensitive),
          status: p.status,
          failureCode: p.failureCode,
          createdAt: p.createdAt.toISOString(),
          history: p.history.map((h) => ({ from: h.fromStatus, to: h.toStatus, reason: h.reason, at: h.createdAt.toISOString() })),
        })),
      })),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  /** Raw gateway payloads: sensitive. */
  @Get("webhook-events")
  @RequirePlatformPermission("admin:payments:sensitive")
  @ApiPaginationQuery()
  async webhookEvents(@Query(new ZodValidationPipe(paginationQuerySchema)) q: z.infer<typeof paginationQuerySchema>): Promise<Paginated<unknown>> {
    const [items, total] = await Promise.all([
      this.db.webhookEvent.findMany({ orderBy: { receivedAt: "desc" }, ...page(q) }),
      this.db.webhookEvent.count(),
    ]);
    return { items, page: q.page, pageSize: q.pageSize, total };
  }

  // ---- licenses ------------------------------------------------------------------

  @Get("licenses")
  @RequirePlatformPermission("admin:licenses:write")
  @ApiPaginationQuery()
  async licenses(@Query(new ZodValidationPipe(billingListQuerySchema)) q: ListQuery): Promise<Paginated<unknown>> {
    const status = q.status === "AVAILABLE" || q.status === "REDEEMED" || q.status === "REVOKED" ? q.status : undefined;
    const where: Prisma.LicenseWhereInput = {
      ...(status ? { status } : {}),
      ...(q.q ? { OR: [{ keyPrefix: { startsWith: q.q.toUpperCase() } }, { note: { contains: q.q, mode: "insensitive" } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.license.findMany({ where, include: { plan: { select: { id: true, name: true } }, redeemedByOrg: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, ...page(q) }),
      this.db.license.count({ where }),
    ]);
    return {
      items: items.map(({ keyHash: _hash, ...l }) => ({ ...l, redeemableUntil: l.redeemableUntil?.toISOString() ?? null, redeemedAt: l.redeemedAt?.toISOString() ?? null, createdAt: l.createdAt.toISOString() })),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  /** The plain keys appear only in this response; only their hashes are stored. */
  @Post("licenses")
  @RequirePlatformPermission("admin:licenses:write")
  @ApiZodBody(createLicensesSchema)
  async createLicenses(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(createLicensesSchema)) body: z.infer<typeof createLicensesSchema>, @Req() req: AppRequest) {
    const plan = await this.db.plan.findUnique({ where: { id: body.planId } });
    if (!plan) throw AppException.notFound("پلن یافت نشد.");
    const keys = Array.from({ length: body.count }, generateLicenseKey);
    const redeemableUntil = body.redeemableDays ? new Date(Date.now() + body.redeemableDays * DAY_MS) : null;
    await this.db.$transaction(async (tx) => {
      await tx.license.createMany({
        data: keys.map((k) => ({ keyHash: hashToken(k), keyPrefix: k.slice(0, 8), planId: plan.id, periodDays: body.periodDays, note: body.note ?? null, redeemableUntil, createdById: actor.id })),
      });
      await this.audit.recordTx(tx, { category: "BILLING", action: "admin.licenses.created", actorUserId: actor.id, targetType: "plan", targetId: plan.id, client: clientInfo(req), metadata: { count: body.count, periodDays: body.periodDays } });
    });
    return { keys, plan: { id: plan.id, name: plan.name }, periodDays: body.periodDays };
  }

  @Post("licenses/:licenseId/revoke")
  @RequirePlatformPermission("admin:licenses:write")
  @HttpCode(HttpStatus.OK)
  async revoke(@CurrentUser() actor: AuthUser, @Param("licenseId", uuid) id: string, @Req() req: AppRequest) {
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.license.updateMany({ where: { id, status: "AVAILABLE" }, data: { status: "REVOKED" } });
      if (count === 0) throw AppException.conflict("فقط کلیدهای استفاده‌نشده قابل ابطال هستند.");
      await this.audit.recordTx(tx, { category: "BILLING", action: "admin.license.revoked", actorUserId: actor.id, targetType: "license", targetId: id, client: clientInfo(req) });
    });
    return { id, status: "REVOKED" };
  }
}
