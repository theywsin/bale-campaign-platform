import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { campaignStatesAllowing, paginationQuerySchema, RECIPIENT_STATUSES, type Paginated } from "@bcp/shared";
import type { Prisma } from "@bcp/database";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { API_ENV, type ApiEnv } from "../config/env";
import { CurrentUser, RequirePlatformPermission } from "../common/decorators/auth.decorators";
import { ApiPaginationQuery, ApiZodBody, ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AppRequest, AuthUser, clientInfo } from "../common/request-context";
import { AppException } from "../common/errors";

const campaignQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["DRAFT", "SCHEDULED", "QUEUED", "RUNNING", "PAUSED", "COMPLETED", "CANCELLED", "FAILED"]).optional(),
});
const stopSchema = z.object({
  reason: z.string({ error: "دلیل الزامی است." }).trim().min(5, "دلیل را کامل بنویسید.").max(250),
});
const DAY_MS = 24 * 3600 * 1000;

@ApiTags("admin-ops")
@Controller({ path: "admin", version: "1" })
export class AdminOpsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  /** Campaigns across all organizations, for moderation. Message text is included: moderators need it to judge abuse. */
  @Get("campaigns")
  @RequirePlatformPermission("admin:campaigns:moderate")
  @ApiPaginationQuery()
  async campaigns(@Query(new ZodValidationPipe(campaignQuerySchema)) q: z.infer<typeof campaignQuerySchema>): Promise<Paginated<unknown>> {
    const where: Prisma.CampaignWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { messageText: { contains: q.q, mode: "insensitive" } }, { organization: { name: { contains: q.q, mode: "insensitive" } } }] }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.campaign.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          name: true,
          messageText: true,
          status: true,
          failureReason: true,
          createdAt: true,
          startedAt: true,
          organization: { select: { id: true, name: true } },
          messagingAccount: { select: { provider: true, displayName: true } },
          _count: { select: { recipients: true } },
        },
      }),
      this.db.campaign.count({ where }),
    ]);
    return {
      items: items.map(({ _count, ...c }) => ({ ...c, totalRecipients: _count.recipients })),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  /** Cancels a campaign for policy reasons; the customer sees the reason and cannot resume it. */
  @Post("campaigns/:campaignId/stop")
  @RequirePlatformPermission("admin:campaigns:moderate")
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(stopSchema)
  async stop(
    @CurrentUser() actor: AuthUser,
    @Param("campaignId", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(stopSchema)) body: z.infer<typeof stopSchema>,
    @Req() req: AppRequest,
  ) {
    const c = await this.db.campaign.findUnique({ where: { id }, select: { organizationId: true } });
    if (!c) throw AppException.notFound("کمپین یافت نشد.");
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.campaign.updateMany({
        where: { id, status: { in: campaignStatesAllowing("CANCELLED") } },
        data: { status: "CANCELLED", finishedAt: new Date(), failureReason: `توقف توسط مدیریت سامانه: ${body.reason}`.slice(0, 300) },
      });
      if (count === 0) throw AppException.conflict("این کمپین در وضعیتی نیست که بتوان آن را متوقف کرد.");
      await tx.campaignRecipient.updateMany({
        where: { campaignId: id, status: "PENDING" },
        data: { status: "FAILED", lastErrorCode: "STOPPED_BY_ADMIN", lastErrorMessage: "کمپین توسط مدیریت سامانه متوقف شد." },
      });
      await this.audit.recordTx(tx, {
        category: "ADMIN",
        action: "admin.campaign.stopped",
        actorUserId: actor.id,
        organizationId: c.organizationId,
        targetType: "campaign",
        targetId: id,
        client: clientInfo(req),
        metadata: { reason: body.reason },
      });
    });
    return { id, status: "CANCELLED" };
  }

  /** Health of the sending pipeline from real data: configuration, recent outcomes, backlog. No secrets. */
  @Get("providers")
  @RequirePlatformPermission("admin:dashboard")
  async providers() {
    const since = new Date(Date.now() - DAY_MS);
    const [accounts, outcomes, lastAccepted, outboxPending, oldestOutbox, outboxFailed, processing, unknown24h] = await Promise.all([
      this.db.messagingAccount.groupBy({ by: ["provider", "status"], _count: true }),
      this.db.$queryRaw<{ provider: string; outcome: string | null; n: bigint }[]>`
        SELECT a.provider::text AS provider, m.outcome::text AS outcome, count(*) AS n
          FROM message_attempts m
          JOIN campaign_recipients r ON r.id = m.recipient_id
          JOIN campaigns c ON c.id = r.campaign_id
          JOIN messaging_accounts a ON a.id = c.messaging_account_id
         WHERE m.started_at >= ${since}
         GROUP BY 1, 2`,
      this.db.$queryRaw<{ provider: string; at: Date }[]>`
        SELECT a.provider::text AS provider, max(m.finished_at) AS at
          FROM message_attempts m
          JOIN campaign_recipients r ON r.id = m.recipient_id
          JOIN campaigns c ON c.id = r.campaign_id
          JOIN messaging_accounts a ON a.id = c.messaging_account_id
         WHERE m.outcome = 'ACCEPTED'
         GROUP BY 1`,
      this.db.outboxEvent.count({ where: { status: "PENDING" } }),
      this.db.outboxEvent.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      this.db.outboxEvent.count({ where: { status: "FAILED" } }),
      this.db.campaignRecipient.count({ where: { status: "PROCESSING" } }),
      this.db.campaignRecipient.count({ where: { status: "UNKNOWN", updatedAt: { gte: since } } }),
    ]);
    const providers = (["BALE_BOT", "MOCK"] as const).map((provider) => {
      const counts = Object.fromEntries(["ACCEPTED", "FAILED_RETRYABLE", "FAILED_PERMANENT", "UNKNOWN", "IN_FLIGHT"].map((k) => [k, 0])) as Record<string, number>;
      for (const o of outcomes.filter((x) => x.provider === provider)) counts[o.outcome ?? "IN_FLIGHT"] = Number(o.n);
      return {
        provider,
        enabled: provider === "MOCK" ? this.env.MESSAGING_MOCK_ENABLED : Boolean(this.env.CREDENTIALS_ENCRYPTION_KEY),
        apiHost: provider === "BALE_BOT" ? new URL(this.env.BALE_API_BASE_URL).host : null,
        activeAccounts: accounts.find((a) => a.provider === provider && a.status === "ACTIVE")?._count ?? 0,
        disabledAccounts: accounts.find((a) => a.provider === provider && a.status === "DISABLED")?._count ?? 0,
        attempts24h: counts,
        lastAcceptedAt: lastAccepted.find((l) => l.provider === provider)?.at?.toISOString() ?? null,
      };
    });
    return {
      providers,
      pipeline: {
        outboxPending,
        outboxFailed,
        oldestPendingSeconds: oldestOutbox ? Math.round((Date.now() - oldestOutbox.createdAt.getTime()) / 1000) : null,
        recipientsProcessing: processing,
        unknown24h,
      },
      recipientStatuses: RECIPIENT_STATUSES,
    };
  }
}
