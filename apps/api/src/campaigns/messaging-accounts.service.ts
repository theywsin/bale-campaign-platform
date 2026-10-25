import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { BaleBotProvider, CredentialsCipher, toMessagingError } from "@bcp/messaging";
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
    externalName: a.externalName,
    lastCheckedAt: a.lastCheckedAt?.toISOString() ?? null,
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
  ) {
    this.cipher = env.CREDENTIALS_ENCRYPTION_KEY ? new CredentialsCipher(env.CREDENTIALS_ENCRYPTION_KEY) : null;
  }

  private readonly cipher: CredentialsCipher | null;

  get mockEnabled(): boolean {
    return this.env.MESSAGING_MOCK_ENABLED;
  }

  get baleEnabled(): boolean {
    return this.cipher !== null;
  }

  private requireCipher(): CredentialsCipher {
    if (!this.cipher) throw AppException.unavailable("اتصال بله در این استقرار پیکربندی نشده است (کلید رمزنگاری تنظیم نشده).");
    return this.cipher;
  }

  /**
   * Calls getMe with the token. Invalid tokens become a validation error; an
   * unreachable Bale API becomes 503. Error text never contains the token.
   */
  private async verifyToken(token: string): Promise<{ username: string | null }> {
    try {
      const me = await new BaleBotProvider(token, this.env.BALE_API_BASE_URL, 15_000).getMe();
      return { username: me.username ? `@${me.username}`.slice(0, 100) : null };
    } catch (thrown) {
      const err = toMessagingError(thrown);
      if (err.kind === "PERMANENT") {
        throw AppException.validation("بله این توکن را نپذیرفت. توکن را از BotFather بله دوباره بررسی کنید.", { token: ["توکن معتبر نیست."] });
      }
      throw AppException.unavailable("اتصال به API بله برقرار نشد. کمی بعد دوباره تلاش کنید.");
    }
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

  async createBaleBot(
    ctx: OrgContext,
    actor: AuthUser,
    data: { displayName: string; token: string; rateLimitPerMinute: number },
    client: ClientInfo,
  ): Promise<MessagingAccountInfo> {
    const cipher = this.requireCipher();
    const count = await this.prisma.client.messagingAccount.count({ where: { organizationId: ctx.organizationId } });
    if (count >= MAX_ACCOUNTS_PER_ORG) throw AppException.conflict(`حداکثر ${MAX_ACCOUNTS_PER_ORG} حساب ارسال مجاز است.`);
    const { username } = await this.verifyToken(data.token);
    const id = randomUUID();
    return this.prisma.client.$transaction(async (tx) => {
      const a = await tx.messagingAccount.create({
        data: {
          id,
          organizationId: ctx.organizationId,
          provider: "BALE_BOT",
          displayName: data.displayName,
          rateLimitPerMinute: data.rateLimitPerMinute,
          credentialsEncrypted: cipher.encrypt(data.token, id),
          externalName: username,
          lastCheckedAt: new Date(),
        },
      });
      await this.audit.recordTx(tx, { category: "CAMPAIGN", action: "messaging_account.created", actorUserId: actor.id, organizationId: ctx.organizationId, targetType: "messaging_account", targetId: a.id, client, metadata: { provider: "BALE_BOT" } });
      return toAccountInfo(a);
    });
  }

  private async loadBale(ctx: OrgContext, id: string) {
    const a = await this.prisma.client.messagingAccount.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!a) throw AppException.notFound("حساب ارسال یافت نشد.");
    if (a.provider !== "BALE_BOT") throw AppException.validation("این عملیات فقط برای حساب بازوی بله است.");
    return a;
  }

  /** Re-checks the stored token with getMe. */
  async check(ctx: OrgContext, id: string): Promise<MessagingAccountInfo> {
    const a = await this.loadBale(ctx, id);
    if (!a.credentialsEncrypted) throw AppException.conflict("توکنی برای این حساب ثبت نشده است.");
    const { username } = await this.verifyToken(this.requireCipher().decrypt(a.credentialsEncrypted, a.id));
    return toAccountInfo(await this.prisma.client.messagingAccount.update({ where: { id }, data: { externalName: username, lastCheckedAt: new Date() } }));
  }

  async rotateToken(ctx: OrgContext, actor: AuthUser, id: string, token: string, client: ClientInfo): Promise<MessagingAccountInfo> {
    const cipher = this.requireCipher();
    await this.loadBale(ctx, id);
    const { username } = await this.verifyToken(token);
    return this.prisma.client.$transaction(async (tx) => {
      const a = await tx.messagingAccount.update({
        where: { id },
        data: { credentialsEncrypted: cipher.encrypt(token, id), externalName: username, lastCheckedAt: new Date() },
      });
      await this.audit.recordTx(tx, { category: "CAMPAIGN", action: "messaging_account.token_rotated", actorUserId: actor.id, organizationId: ctx.organizationId, targetType: "messaging_account", targetId: id, client });
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
