import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomInt, randomUUID } from "node:crypto";
import {
  canTransitionPayment,
  nextSubscriptionPeriod,
  orgRoleHasPermission,
  isOrganizationRole,
  type BillingOverview,
  type CheckoutResult,
  type OrderInfo,
  type PlanInfo,
  type SubscriptionInfo,
} from "@bcp/shared";
import { Prisma } from "@bcp/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { API_ENV, type ApiEnv } from "../config/env";
import { AppException } from "../common/errors";
import { hashToken } from "../common/security/tokens";
import type { AuthUser, ClientInfo, OrgContext } from "../common/request-context";
import { EntitlementsService } from "./entitlements.service";
import { MockPaymentGateway, type GatewayEvent, type GatewayOutcome } from "./payment-gateway";

type Tx = Prisma.TransactionClient;
type PlanRow = Prisma.PlanGetPayload<object>;

export function toPlanInfo(p: PlanRow): PlanInfo {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    priceRials: p.priceRials.toString(),
    periodDays: p.periodDays,
    maxContacts: p.maxContacts,
    maxMonthlyMessages: p.maxMonthlyMessages,
    maxMessagingAccounts: p.maxMessagingAccounts,
    maxMembers: p.maxMembers,
    isPublic: p.isPublic,
    isActive: p.isActive,
    isDefault: p.isDefault,
    sortOrder: p.sortOrder,
  };
}

export function toSubscriptionInfo(s: Prisma.SubscriptionGetPayload<{ include: { plan: true } }>): SubscriptionInfo {
  return {
    id: s.id,
    status: s.status,
    source: s.source,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    plan: { id: s.plan.id, code: s.plan.code, name: s.plan.name },
  };
}

const orderInclude = {
  plan: { select: { id: true, name: true } },
  payments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
} as const;

export function toOrderInfo(o: Prisma.OrderGetPayload<{ include: typeof orderInclude }>): OrderInfo {
  return {
    id: o.id,
    plan: o.plan,
    amountRials: o.amountRials.toString(),
    periodDays: o.periodDays,
    status: o.status,
    paymentStatus: o.payments[0]?.status ?? null,
    paidAt: o.paidAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
  };
}

const LICENSE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** BCP-XXXX-XXXX-XXXX-XXXX: 80 random bits in Crockford base32. */
export function generateLicenseKey(): string {
  const groups = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => LICENSE_ALPHABET[randomInt(32)]).join(""));
  return `BCP-${groups.join("-")}`;
}

const OUTCOME_TO_ORDER = { SUCCEEDED: "PAID", FAILED: "FAILED", CANCELED: "CANCELED" } as const;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  readonly gateway: MockPaymentGateway | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.gateway = env.PAYMENTS_MOCK_ENABLED && env.PAYMENT_WEBHOOK_SECRET ? new MockPaymentGateway(env.PAYMENT_WEBHOOK_SECRET) : null;
  }

  private get db() {
    return this.prisma.client;
  }

  // ---- customer ------------------------------------------------------------

  async publicPlans(): Promise<PlanInfo[]> {
    const plans = await this.db.plan.findMany({ where: { isActive: true, isPublic: true }, orderBy: [{ sortOrder: "asc" }, { priceRials: "asc" }] });
    return plans.map(toPlanInfo);
  }

  async overview(ctx: OrgContext): Promise<BillingOverview> {
    const orgId = ctx.organizationId;
    const [ent, usage, plans, orders] = await Promise.all([
      this.entitlements.get(orgId),
      this.entitlements.usage(orgId),
      this.publicPlans(),
      this.db.order.findMany({ where: { organizationId: orgId }, include: orderInclude, orderBy: { createdAt: "desc" }, take: 20 }),
    ]);
    const sub = ent.subscription
      ? await this.db.subscription.findUnique({ where: { id: ent.subscription.id }, include: { plan: true } })
      : null;
    return {
      plan: ent.plan,
      subscription: sub ? toSubscriptionInfo(sub) : null,
      limits: ent.limits,
      usage,
      plans,
      orders: orders.map(toOrderInfo),
      paymentsEnabled: this.gateway !== null,
      paymentsTestOnly: this.gateway?.testOnly ?? false,
    };
  }

  async checkout(ctx: OrgContext, actor: AuthUser, planId: string, client: ClientInfo): Promise<CheckoutResult> {
    const plan = await this.db.plan.findFirst({ where: { id: planId, isActive: true, isPublic: true } });
    if (!plan) throw AppException.notFound("پلن یافت نشد.");
    const orgId = ctx.organizationId;

    if (plan.priceRials === 0n) {
      // Free plans are activated directly; there is nothing to pay.
      const order = await this.db.$transaction(async (tx) => {
        const subscriptionId = await this.activate(tx, orgId, plan.id, plan.periodDays, "PAYMENT");
        const o = await tx.order.create({
          data: { organizationId: orgId, planId: plan.id, amountRials: 0n, periodDays: plan.periodDays, status: "PAID", paidAt: new Date(), subscriptionId, createdById: actor.id },
          include: orderInclude,
        });
        await this.audit.recordTx(tx, { category: "BILLING", action: "order.free_activated", actorUserId: actor.id, organizationId: orgId, targetType: "order", targetId: o.id, client, metadata: { plan: plan.code } });
        return o;
      });
      return { order: toOrderInfo(order), redirectUrl: null };
    }

    const gateway = this.gateway;
    if (!gateway) {
      throw new AppException(503, "PAYMENT_UNAVAILABLE", "درگاه پرداخت در این استقرار پیکربندی نشده است. برای خرید با پشتیبانی تماس بگیرید یا از کلید لایسنس استفاده کنید.");
    }
    const paymentId = randomUUID();
    const { providerRef, redirectPath } = gateway.createPayment({ paymentId, amountRials: plan.priceRials });
    const order = await this.db.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: { organizationId: orgId, planId: plan.id, amountRials: plan.priceRials, periodDays: plan.periodDays, createdById: actor.id },
      });
      await tx.payment.create({
        data: {
          id: paymentId,
          orderId: o.id,
          provider: gateway.type,
          providerRef,
          amountRials: plan.priceRials,
          history: { create: { toStatus: "INITIATED", reason: "created" } },
        },
      });
      await this.audit.recordTx(tx, { category: "BILLING", action: "order.created", actorUserId: actor.id, organizationId: orgId, targetType: "order", targetId: o.id, client, metadata: { plan: plan.code, amountRials: plan.priceRials.toString() } });
      return tx.order.findUniqueOrThrow({ where: { id: o.id }, include: orderInclude });
    });
    return { order: toOrderInfo(order), redirectUrl: redirectPath };
  }

  async redeemLicense(ctx: OrgContext, actor: AuthUser, key: string, client: ClientInfo): Promise<SubscriptionInfo> {
    const keyHash = hashToken(key);
    const orgId = ctx.organizationId;
    const subId = await this.db.$transaction(async (tx) => {
      const now = new Date();
      const license = await tx.license.findUnique({ where: { keyHash } });
      const { count } = await tx.license.updateMany({
        where: { keyHash, status: "AVAILABLE", OR: [{ redeemableUntil: null }, { redeemableUntil: { gt: now } }], plan: { isActive: true } },
        data: { status: "REDEEMED", redeemedByOrgId: orgId, redeemedAt: now },
      });
      // One message for unknown, used, revoked and expired keys, so keys cannot be probed.
      if (count === 0 || !license) throw AppException.notFound("کلید لایسنس نامعتبر است یا قبلاً استفاده شده است.");
      const id = await this.activate(tx, orgId, license.planId, license.periodDays, "LICENSE");
      await this.audit.recordTx(tx, { category: "BILLING", action: "license.redeemed", actorUserId: actor.id, organizationId: orgId, targetType: "license", targetId: license.id, client });
      return id;
    });
    return toSubscriptionInfo(await this.db.subscription.findUniqueOrThrow({ where: { id: subId }, include: { plan: true } }));
  }

  // ---- mock checkout ---------------------------------------------------------

  /** The payer must hold billing:write in the order's organization. Others get 404. */
  private async loadPaymentFor(user: AuthUser, paymentId: string) {
    const payment = await this.db.payment.findUnique({
      where: { id: paymentId },
      include: { order: { include: { plan: { select: { name: true } }, organization: { select: { id: true, name: true, status: true } } } } },
    });
    if (!payment) throw AppException.notFound("پرداخت یافت نشد.");
    const member = await this.db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: payment.order.organizationId, userId: user.id } },
      select: { role: true },
    });
    if (!member || !isOrganizationRole(member.role) || !orgRoleHasPermission(member.role, "billing:write") || payment.order.organization.status !== "ACTIVE") {
      throw AppException.notFound("پرداخت یافت نشد.");
    }
    return payment;
  }

  async mockCheckoutInfo(user: AuthUser, paymentId: string) {
    if (!this.gateway) throw AppException.notFound("پرداخت یافت نشد.");
    const p = await this.loadPaymentFor(user, paymentId);
    return {
      paymentId: p.id,
      status: p.status,
      amountRials: p.amountRials.toString(),
      planName: p.order.plan.name,
      organizationId: p.order.organization.id,
      organizationName: p.order.organization.name,
      testOnly: true,
    };
  }

  /** Simulates the gateway: builds a signed callback and feeds it through the normal webhook path. */
  async mockComplete(user: AuthUser, paymentId: string, outcome: GatewayOutcome) {
    const gateway = this.gateway;
    if (!gateway) throw AppException.notFound("پرداخت یافت نشد.");
    const p = await this.loadPaymentFor(user, paymentId);
    const event: GatewayEvent = { eventId: `evt_${randomUUID()}`, providerRef: p.providerRef, outcome, amountRials: p.amountRials.toString() };
    await this.handleWebhook("MOCK", gateway.sign(event), event);
    return this.mockCheckoutInfo(user, paymentId);
  }

  // ---- webhooks ---------------------------------------------------------------

  /**
   * Idempotent: the event row is inserted in the same transaction as its effects, so a redelivered
   * event (same provider + eventId) is a no-op, and a failed run leaves nothing behind to block a retry.
   */
  async handleWebhook(provider: "MOCK", signature: string | undefined, body: unknown): Promise<{ status: "processed" | "duplicate" | "ignored" }> {
    const gateway = this.gateway;
    if (!gateway || gateway.type !== provider) throw AppException.notFound();
    const event = gateway.parseWebhook(signature, body);
    if (!event) {
      this.logger.warn({ provider }, "payment webhook rejected: bad signature or payload");
      throw new AppException(401, "UNAUTHENTICATED", "امضای درخواست نامعتبر است.");
    }
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.webhookEvent.create({
          data: { provider, eventId: event.eventId, type: `payment.${event.outcome.toLowerCase()}`, payload: { ...event }, processedAt: new Date() },
        });
        const result = await this.applyPaymentOutcome(tx, provider, event);
        if (result !== "processed") {
          await tx.webhookEvent.update({ where: { provider_eventId: { provider, eventId: event.eventId } }, data: { error: result } });
        }
        return { status: result === "processed" ? "processed" : "ignored" } as const;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { status: "duplicate" };
      throw err;
    }
  }

  private async applyPaymentOutcome(tx: Tx, provider: "MOCK", event: GatewayEvent): Promise<"processed" | string> {
    // Row lock: concurrent callbacks for one payment are serialized.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM payments WHERE provider = ${provider}::"PaymentProviderType" AND provider_ref = ${event.providerRef} FOR UPDATE`;
    if (locked.length === 0) return "unknown_payment";
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: locked[0]!.id }, include: { order: true } });

    let to: "SUCCEEDED" | "FAILED" | "CANCELED" = event.outcome;
    let reason = `gateway:${event.outcome.toLowerCase()}`;
    if (event.outcome === "SUCCEEDED" && BigInt(event.amountRials) !== payment.amountRials) {
      to = "FAILED";
      reason = "amount_mismatch";
    }
    if (!canTransitionPayment(payment.status, to)) return `ignored_final_state:${payment.status}`;

    await tx.payment.update({ where: { id: payment.id }, data: { status: to, failureCode: to === "SUCCEEDED" ? null : reason.slice(0, 50) } });
    await tx.paymentStatusHistory.create({ data: { paymentId: payment.id, fromStatus: payment.status, toStatus: to, reason } });

    const order = payment.order;
    if (order.status !== "PENDING") return "processed";
    if (to === "SUCCEEDED") {
      const subscriptionId = await this.activate(tx, order.organizationId, order.planId, order.periodDays, "PAYMENT");
      await tx.order.update({ where: { id: order.id }, data: { status: "PAID", paidAt: new Date(), subscriptionId } });
    } else {
      await tx.order.update({ where: { id: order.id }, data: { status: OUTCOME_TO_ORDER[to] } });
    }
    await this.audit.recordTx(tx, {
      category: "BILLING",
      action: to === "SUCCEEDED" ? "payment.succeeded" : "payment.failed",
      organizationId: order.organizationId,
      targetType: "order",
      targetId: order.id,
      metadata: { reason },
    });
    return "processed";
  }

  // ---- subscriptions -------------------------------------------------------------

  /**
   * Grants `periodDays` of `planId`. Same plan and still running: extends it. Otherwise the current
   * subscription is closed and a new one starts now. Returns the active subscription id.
   */
  async activate(tx: Tx, organizationId: string, planId: string, periodDays: number, source: "PAYMENT" | "LICENSE" | "ADMIN"): Promise<string> {
    // Serialize grants per organization.
    await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`;
    const now = new Date();
    const current = await tx.subscription.findFirst({ where: { organizationId, status: "ACTIVE" } });
    const next = nextSubscriptionPeriod(now, periodDays, current, planId);
    if (current && next.extendsCurrent) {
      await tx.subscription.update({ where: { id: current.id }, data: { endsAt: next.endsAt } });
      return current.id;
    }
    if (current) {
      const expired = current.endsAt <= now;
      await tx.subscription.update({
        where: { id: current.id },
        data: expired ? { status: "EXPIRED" } : { status: "CANCELED", canceledAt: now },
      });
    }
    const created = await tx.subscription.create({ data: { organizationId, planId, source, startsAt: now, endsAt: next.endsAt } });
    return created.id;
  }
}
