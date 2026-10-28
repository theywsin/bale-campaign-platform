import { Global, Injectable, Module } from "@nestjs/common";
import { monthStartUtc, PLAN_LIMIT_KEYS, PLAN_LIMIT_LABELS, withinLimit, type PlanLimitKey, type PlanLimits } from "@bcp/shared";
import type { Prisma } from "@bcp/database";
import { PrismaService } from "../prisma/prisma.service";
import { AppException } from "../common/errors";

type Db = Prisma.TransactionClient | PrismaService["client"];

export interface Entitlements {
  /** The plan whose limits apply: the active subscription's, else the default plan, else none (unlimited). */
  plan: { id: string; code: string; name: string } | null;
  subscription: { id: string; source: string; startsAt: Date; endsAt: Date } | null;
  limits: PlanLimits;
}

const UNLIMITED: PlanLimits = { maxContacts: null, maxMonthlyMessages: null, maxMessagingAccounts: null, maxMembers: null };

/**
 * Plan limits for an organization. A subscription counts as active only while `endsAt` is in the
 * future, so an expired-but-not-yet-swept subscription never grants anything.
 */
@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(organizationId: string, db: Db = this.prisma.client): Promise<Entitlements> {
    const sub = await db.subscription.findFirst({
      where: { organizationId, status: "ACTIVE", endsAt: { gt: new Date() } },
      include: { plan: true },
    });
    const plan = sub?.plan ?? (await db.plan.findFirst({ where: { isDefault: true, isActive: true } }));
    if (!plan) return { plan: null, subscription: null, limits: UNLIMITED };
    const limits = Object.fromEntries(PLAN_LIMIT_KEYS.map((k) => [k, plan[k]])) as PlanLimits;
    return {
      plan: { id: plan.id, code: plan.code, name: plan.name },
      subscription: sub ? { id: sub.id, source: sub.source, startsAt: sub.startsAt, endsAt: sub.endsAt } : null,
      limits,
    };
  }

  /** Monthly messages count recipients that will actually be attempted (not suppressed, with a chat id). */
  async usage(organizationId: string, db: Db = this.prisma.client): Promise<Record<PlanLimitKey, number>> {
    const [maxContacts, maxMonthlyMessages, maxMessagingAccounts, members, invitations] = await Promise.all([
      db.contact.count({ where: { organizationId } }),
      db.campaignRecipient.count({
        where: { organizationId, createdAt: { gte: monthStartUtc(new Date()) }, status: { not: "SUPPRESSED" }, chatId: { not: null } },
      }),
      db.messagingAccount.count({ where: { organizationId } }),
      db.organizationMember.count({ where: { organizationId } }),
      db.invitation.count({ where: { organizationId, status: "PENDING", expiresAt: { gt: new Date() } } }),
    ]);
    return { maxContacts, maxMonthlyMessages, maxMessagingAccounts, maxMembers: members + invitations };
  }

  /**
   * Throws PLAN_LIMIT_REACHED unless `adding` more items fit. Pass the transaction when the check
   * must see rows the transaction itself inserted (campaign recipients).
   */
  async assertWithin(organizationId: string, key: PlanLimitKey, adding: number, db: Db = this.prisma.client): Promise<void> {
    const { limits } = await this.get(organizationId, db);
    const limit = limits[key];
    if (limit === null) return;
    const used = (await this.usage(organizationId, db))[key];
    if (!withinLimit(limit, used, adding)) {
      throw AppException.planLimit(
        `سقف ${limit.toLocaleString("fa-IR")} ${PLAN_LIMIT_LABELS[key]} در پلن فعلی پر شده است. برای افزایش سقف، پلن خود را ارتقا دهید.`,
      );
    }
  }
}

@Global()
@Module({ providers: [EntitlementsService], exports: [EntitlementsService] })
export class EntitlementsModule {}
