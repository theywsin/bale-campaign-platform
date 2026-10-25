import { Inject, Injectable } from "@nestjs/common";
import {
  campaignStatesAllowing,
  OUTBOX_CAMPAIGN_DISPATCH,
  RECIPIENT_STATUSES,
  type CampaignInfo,
  type CampaignRecipientInfo,
  type CampaignStatus,
  type Paginated,
  type PaginationQuery,
  type RecipientCounts,
  type RecipientStatus,
} from "@bcp/shared";
import type { Prisma } from "@bcp/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { API_ENV, type ApiEnv } from "../config/env";
import { AppException } from "../common/errors";
import type { AuthUser, ClientInfo, OrgContext } from "../common/request-context";

type Tx = Prisma.TransactionClient;

const campaignInclude = {
  messagingAccount: { select: { id: true, displayName: true, provider: true } },
  list: { select: { id: true, name: true } },
} as const;
type CampaignRow = Prisma.CampaignGetPayload<{ include: typeof campaignInclude }>;

const emptyCounts = (): RecipientCounts =>
  Object.fromEntries(RECIPIENT_STATUSES.map((s) => [s, 0])) as RecipientCounts;

export interface CampaignFields {
  name?: string;
  messageText?: string;
  messagingAccountId?: string;
  listId?: string | null;
}

/** All queries are scoped by ctx.organizationId (see OrgPermissionGuard). */
@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  private async counts(campaignIds: string[]): Promise<Map<string, RecipientCounts>> {
    const map = new Map<string, RecipientCounts>(campaignIds.map((id) => [id, emptyCounts()]));
    if (!campaignIds.length) return map;
    const groups = await this.db.campaignRecipient.groupBy({ by: ["campaignId", "status"], where: { campaignId: { in: campaignIds } }, _count: { _all: true } });
    for (const g of groups) map.get(g.campaignId)![g.status] = g._count._all;
    return map;
  }

  private toInfo(c: CampaignRow, counts: RecipientCounts): CampaignInfo {
    return {
      id: c.id,
      name: c.name,
      messageText: c.messageText,
      status: c.status,
      messagingAccount: c.messagingAccount,
      list: c.list,
      scheduledAt: c.scheduledAt?.toISOString() ?? null,
      startedAt: c.startedAt?.toISOString() ?? null,
      finishedAt: c.finishedAt?.toISOString() ?? null,
      failureReason: c.failureReason,
      createdAt: c.createdAt.toISOString(),
      counts,
      totalRecipients: Object.values(counts).reduce((a, b) => a + b, 0),
    };
  }

  private async load(ctx: OrgContext, id: string): Promise<CampaignRow> {
    const c = await this.db.campaign.findFirst({ where: { id, organizationId: ctx.organizationId }, include: campaignInclude });
    if (!c) throw AppException.notFound("کمپین یافت نشد.");
    return c;
  }

  async list(ctx: OrgContext, q: PaginationQuery): Promise<Paginated<CampaignInfo>> {
    const where: Prisma.CampaignWhereInput = { organizationId: ctx.organizationId, ...(q.q ? { name: { contains: q.q, mode: "insensitive" } } : {}) };
    const [rows, total] = await Promise.all([
      this.db.campaign.findMany({ where, include: campaignInclude, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.db.campaign.count({ where }),
    ]);
    const counts = await this.counts(rows.map((r) => r.id));
    return { items: rows.map((r) => this.toInfo(r, counts.get(r.id)!)), page: q.page, pageSize: q.pageSize, total };
  }

  async get(ctx: OrgContext, id: string): Promise<CampaignInfo> {
    const c = await this.load(ctx, id);
    return this.toInfo(c, (await this.counts([c.id])).get(c.id)!);
  }

  /** Checks that referenced account and list belong to this organization. */
  private async checkRefs(ctx: OrgContext, data: CampaignFields): Promise<void> {
    if (data.messagingAccountId) {
      const a = await this.db.messagingAccount.findFirst({ where: { id: data.messagingAccountId, organizationId: ctx.organizationId }, select: { id: true } });
      if (!a) throw AppException.validation("حساب ارسال یافت نشد.", { messagingAccountId: ["حساب ارسال یافت نشد."] });
    }
    if (data.listId) {
      const l = await this.db.contactList.findFirst({ where: { id: data.listId, organizationId: ctx.organizationId }, select: { id: true } });
      if (!l) throw AppException.validation("فهرست یافت نشد.", { listId: ["فهرست یافت نشد."] });
    }
  }

  async create(ctx: OrgContext, actor: AuthUser, data: Required<Omit<CampaignFields, "listId">> & { listId?: string | null }, client: ClientInfo): Promise<CampaignInfo> {
    await this.checkRefs(ctx, data);
    const c = await this.db.$transaction(async (tx) => {
      const c = await tx.campaign.create({
        data: { organizationId: ctx.organizationId, name: data.name, messageText: data.messageText, messagingAccountId: data.messagingAccountId, listId: data.listId ?? null, createdById: actor.id },
        include: campaignInclude,
      });
      await this.audit.recordTx(tx, { category: "CAMPAIGN", action: "campaign.created", actorUserId: actor.id, organizationId: ctx.organizationId, targetType: "campaign", targetId: c.id, client });
      return c;
    });
    return this.toInfo(c, emptyCounts());
  }

  async update(ctx: OrgContext, actor: AuthUser, id: string, data: CampaignFields, client: ClientInfo): Promise<CampaignInfo> {
    await this.load(ctx, id);
    await this.checkRefs(ctx, data);
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.campaign.updateMany({ where: { id, organizationId: ctx.organizationId, status: "DRAFT" }, data });
      if (count === 0) throw AppException.conflict("فقط کمپین پیش‌نویس قابل ویرایش است.");
      await this.audit.recordTx(tx, { category: "CAMPAIGN", action: "campaign.updated", actorUserId: actor.id, organizationId: ctx.organizationId, targetType: "campaign", targetId: id, client });
    });
    return this.get(ctx, id);
  }

  async remove(ctx: OrgContext, actor: AuthUser, id: string, client: ClientInfo): Promise<void> {
    await this.load(ctx, id);
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.campaign.deleteMany({ where: { id, organizationId: ctx.organizationId, status: "DRAFT" } });
      if (count === 0) throw AppException.conflict("فقط کمپین پیش‌نویس قابل حذف است. کمپین‌های ارسال‌شده برای گزارش نگه داشته می‌شوند.");
      await this.audit.recordTx(tx, { category: "CAMPAIGN", action: "campaign.deleted", actorUserId: actor.id, organizationId: ctx.organizationId, targetType: "campaign", targetId: id, client });
    });
  }

  /**
   * Snapshots recipients, moves the campaign to QUEUED (or SCHEDULED) and, for
   * immediate sends, writes the dispatch event to the outbox in the same
   * transaction. Suppressed / opted-out contacts are recorded as SUPPRESSED and
   * contacts without a Bale chat id as FAILED, so the report accounts for everyone.
   */
  async start(ctx: OrgContext, actor: AuthUser, id: string, scheduledAt: Date | undefined, client: ClientInfo): Promise<CampaignInfo> {
    const c = await this.load(ctx, id);
    if (c.status !== "DRAFT") throw AppException.conflict("این کمپین قبلاً شروع شده است.");
    const account = c.messagingAccountId
      ? await this.db.messagingAccount.findFirst({ where: { id: c.messagingAccountId, organizationId: ctx.organizationId } })
      : null;
    if (!account) throw AppException.validation("برای شروع کمپین یک حساب ارسال انتخاب کنید.");
    if (account.status !== "ACTIVE") throw AppException.conflict("حساب ارسال انتخاب‌شده غیرفعال است.");
    if (account.provider === "MOCK" && !this.env.MESSAGING_MOCK_ENABLED) {
      throw AppException.forbidden("حساب آزمایشی (Mock) در این استقرار غیرفعال است.");
    }
    if (account.provider === "BALE_BOT" && (!account.credentialsEncrypted || !this.env.CREDENTIALS_ENCRYPTION_KEY)) {
      throw AppException.conflict("حساب بازوی بله توکن معتبر ندارد یا اتصال بله در این استقرار پیکربندی نشده است.");
    }
    const target: CampaignStatus = scheduledAt && scheduledAt.getTime() > Date.now() ? "SCHEDULED" : "QUEUED";

    await this.db.$transaction(
      async (tx) => {
        const { count } = await tx.campaign.updateMany({
          where: { id, organizationId: ctx.organizationId, status: "DRAFT" },
          data: { status: target, scheduledAt: target === "SCHEDULED" ? scheduledAt : null },
        });
        if (count === 0) throw AppException.conflict("این کمپین قبلاً شروع شده است.");
        const inserted = await this.snapshotRecipients(tx, ctx.organizationId, id, c.listId);
        if (inserted === 0) throw AppException.conflict("هیچ مخاطب فعالی برای این کمپین وجود ندارد.");
        if (target === "QUEUED") {
          await tx.outboxEvent.create({ data: { type: OUTBOX_CAMPAIGN_DISPATCH, payload: { campaignId: id } } });
        }
        await this.audit.recordTx(tx, {
          category: "CAMPAIGN",
          action: target === "SCHEDULED" ? "campaign.scheduled" : "campaign.started",
          actorUserId: actor.id,
          organizationId: ctx.organizationId,
          targetType: "campaign",
          targetId: id,
          client,
          metadata: { recipients: inserted, scheduledAt: scheduledAt?.toISOString() ?? null },
        });
      },
      { timeout: 60_000 },
    );
    return this.get(ctx, id);
  }

  private async snapshotRecipients(tx: Tx, organizationId: string, campaignId: string, listId: string | null): Promise<number> {
    return tx.$executeRaw`
      INSERT INTO campaign_recipients
        (id, campaign_id, organization_id, contact_id, chat_id, status, last_error_code, last_error_message, next_attempt_at, created_at, updated_at)
      SELECT gen_random_uuid(), ${campaignId}::uuid, ${organizationId}::uuid, c.id, c.bale_chat_id,
             CASE
               WHEN c.consent = 'OPTED_OUT'::"ConsentStatus" OR EXISTS (
                      SELECT 1 FROM suppression_entries s
                       WHERE s.organization_id = c.organization_id
                         AND ((s.kind = 'PHONE'::"SuppressionKind" AND s.value = c.phone)
                           OR (s.kind = 'BALE_CHAT_ID'::"SuppressionKind" AND s.value = c.bale_chat_id)))
                 THEN 'SUPPRESSED'::"RecipientStatus"
               WHEN c.bale_chat_id IS NULL THEN 'FAILED'::"RecipientStatus"
               ELSE 'PENDING'::"RecipientStatus"
             END,
             CASE
               WHEN c.consent = 'OPTED_OUT'::"ConsentStatus" THEN 'OPTED_OUT'
               WHEN c.bale_chat_id IS NULL THEN 'NO_CHAT_ID'
             END,
             CASE
               WHEN c.consent = 'OPTED_OUT'::"ConsentStatus" THEN 'مخاطب انصراف داده است.'
               WHEN c.bale_chat_id IS NULL THEN 'شناسه چت بله ندارد؛ بازو فقط به چت‌هایی که آن را شروع کرده‌اند پیام می‌دهد.'
             END,
             now(), now(), now()
        FROM contacts c
       WHERE c.organization_id = ${organizationId}::uuid
         AND c.status = 'ACTIVE'::"ContactStatus"
         AND (${listId}::uuid IS NULL OR EXISTS (
               SELECT 1 FROM contact_list_members m WHERE m.list_id = ${listId}::uuid AND m.contact_id = c.id))
      ON CONFLICT (campaign_id, contact_id) DO NOTHING`;
  }

  private async transition(
    ctx: OrgContext,
    actor: AuthUser,
    id: string,
    to: CampaignStatus,
    action: string,
    client: ClientInfo,
    extra?: (tx: Tx) => Promise<void>,
  ): Promise<CampaignInfo> {
    await this.load(ctx, id);
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.campaign.updateMany({
        where: { id, organizationId: ctx.organizationId, status: { in: campaignStatesAllowing(to) } },
        data: { status: to, ...(to === "CANCELLED" ? { finishedAt: new Date() } : {}) },
      });
      if (count === 0) throw AppException.conflict("وضعیت فعلی کمپین اجازه این عملیات را نمی‌دهد.");
      await extra?.(tx);
      await this.audit.recordTx(tx, { category: "CAMPAIGN", action, actorUserId: actor.id, organizationId: ctx.organizationId, targetType: "campaign", targetId: id, client });
    });
    return this.get(ctx, id);
  }

  /** The worker checks the status before every send, so a pause takes effect within one message. */
  pause(ctx: OrgContext, actor: AuthUser, id: string, client: ClientInfo) {
    return this.transition(ctx, actor, id, "PAUSED", "campaign.paused", client);
  }

  async resume(ctx: OrgContext, actor: AuthUser, id: string, client: ClientInfo) {
    const c = await this.load(ctx, id);
    const scheduled = !c.startedAt && c.scheduledAt && c.scheduledAt.getTime() > Date.now();
    return this.transition(ctx, actor, id, scheduled ? "SCHEDULED" : "QUEUED", "campaign.resumed", client, async (tx) => {
      if (!scheduled) await tx.outboxEvent.create({ data: { type: OUTBOX_CAMPAIGN_DISPATCH, payload: { campaignId: id } } });
    });
  }

  /** Recipients not yet sent are closed as FAILED (CAMPAIGN_CANCELLED); in-flight sends finish normally. */
  cancel(ctx: OrgContext, actor: AuthUser, id: string, client: ClientInfo) {
    return this.transition(ctx, actor, id, "CANCELLED", "campaign.cancelled", client, async (tx) => {
      await tx.campaignRecipient.updateMany({
        where: { campaignId: id, status: "PENDING" },
        data: { status: "FAILED", lastErrorCode: "CAMPAIGN_CANCELLED", lastErrorMessage: "کمپین لغو شد." },
      });
    });
  }

  async recipients(ctx: OrgContext, id: string, q: PaginationQuery & { status?: RecipientStatus }): Promise<Paginated<CampaignRecipientInfo>> {
    await this.load(ctx, id);
    const where: Prisma.CampaignRecipientWhereInput = { campaignId: id, organizationId: ctx.organizationId, ...(q.status ? { status: q.status } : {}) };
    const [rows, total] = await Promise.all([
      this.db.campaignRecipient.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { contact: { select: { firstName: true, lastName: true } } },
      }),
      this.db.campaignRecipient.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        contactId: r.contactId,
        contactName: r.contact ? [r.contact.firstName, r.contact.lastName].filter(Boolean).join(" ") || null : null,
        chatId: r.chatId,
        status: r.status,
        attemptCount: r.attemptCount,
        lastErrorCode: r.lastErrorCode,
        lastErrorMessage: r.lastErrorMessage,
        acceptedAt: r.acceptedAt?.toISOString() ?? null,
        deliveredAt: r.deliveredAt?.toISOString() ?? null,
        updatedAt: r.updatedAt.toISOString(),
      })),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }
}
