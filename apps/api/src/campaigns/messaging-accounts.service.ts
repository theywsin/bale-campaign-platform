import { Inject, Injectable } from "@nestjs/common";
import type { MessagingAccountInfo } from "@bcp/shared";
import type { Prisma } from "@bcp/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { API_ENV, type ApiEnv } from "../config/env";
import { AppException } from "../common/errors";
import type { AuthUser, ClientInfo, OrgContext } from "../common/request-context";

const MAX_ACCOUNTS_PER_ORG = 20;

/** Never exposes `credentialsEncrypted`. */
export function toAccountInfo(a: Prisma.MessagingAccountGetPayload<object>): MessagingAccountInfo {
  return {
    id: a.id,
    provider: a.provider,
    displayName: a.displayName,
    status: a.status,
    rateLimitPerMinute: a.rateLimitPerMinute,
    isTestOnly: a.provider === "MOCK",
    createdAt: a.createdAt.toISOString(),
  };
}

@Injectable()
export class MessagingAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  get mockEnabled(): boolean {
    return this.env.MESSAGING_MOCK_ENABLED;
  }

  async list(ctx: OrgContext): Promise<MessagingAccountInfo[]> {
    const items = await this.prisma.client.messagingAccount.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" } });
    return items.map(toAccountInfo);
  }

  async createMock(ctx: OrgContext, actor: AuthUser, data: { displayName: string; rateLimitPerMinute: number }, client: ClientInfo): Promise<MessagingAccountInfo> {
    if (!this.env.MESSAGING_MOCK_ENABLED) {
      throw AppException.forbidden("حساب آزمایشی (Mock) در این استقرار غیرفعال است.");
    }
    const count = await this.prisma.client.messagingAccount.count({ where: { organizationId: ctx.organizationId } });
    if (count >= MAX_ACCOUNTS_PER_ORG) throw AppException.conflict(`حداکثر ${MAX_ACCOUNTS_PER_ORG} حساب ارسال مجاز است.`);
    return this.prisma.client.$transaction(async (tx) => {
      const a = await tx.messagingAccount.create({
        data: { organizationId: ctx.organizationId, provider: "MOCK", displayName: data.displayName, rateLimitPerMinute: data.rateLimitPerMinute },
      });
      await this.audit.recordTx(tx, { category: "CAMPAIGN", action: "messaging_account.created", actorUserId: actor.id, organizationId: ctx.organizationId, targetType: "messaging_account", targetId: a.id, client, metadata: { provider: "MOCK" } });
      return toAccountInfo(a);
    });
  }

  async setStatus(ctx: OrgContext, actor: AuthUser, id: string, status: "ACTIVE" | "DISABLED", client: ClientInfo): Promise<MessagingAccountInfo> {
    const existing = await this.prisma.client.messagingAccount.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true } });
    if (!existing) throw AppException.notFound("حساب ارسال یافت نشد.");
    return this.prisma.client.$transaction(async (tx) => {
      const a = await tx.messagingAccount.update({ where: { id }, data: { status } });
      await this.audit.recordTx(tx, { category: "CAMPAIGN", action: status === "ACTIVE" ? "messaging_account.enabled" : "messaging_account.disabled", actorUserId: actor.id, organizationId: ctx.organizationId, targetType: "messaging_account", targetId: id, client });
      return toAccountInfo(a);
    });
  }

  async remove(ctx: OrgContext, actor: AuthUser, id: string, client: ClientInfo): Promise<void> {
    const existing = await this.prisma.client.messagingAccount.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true } });
    if (!existing) throw AppException.notFound("حساب ارسال یافت نشد.");
    const active = await this.prisma.client.campaign.count({ where: { messagingAccountId: id, status: { in: ["SCHEDULED", "QUEUED", "RUNNING", "PAUSED"] } } });
    if (active) throw AppException.conflict("این حساب در یک کمپین فعال استفاده می‌شود. ابتدا کمپین را لغو کنید.");
    await this.prisma.client.$transaction(async (tx) => {
      await tx.messagingAccount.delete({ where: { id } });
      await this.audit.recordTx(tx, { category: "CAMPAIGN", action: "messaging_account.deleted", actorUserId: actor.id, organizationId: ctx.organizationId, targetType: "messaging_account", targetId: id, client });
    });
  }
}
