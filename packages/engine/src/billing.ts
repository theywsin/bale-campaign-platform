import type { PrismaClient } from "@bcp/database";

/** Unpaid orders older than this are closed. */
export const STALE_ORDER_HOURS = 24;

/** Marks subscriptions past their end as EXPIRED. Limits already ignore them; this keeps the status honest. */
export async function expireSubscriptions(prisma: PrismaClient, now = new Date()): Promise<number> {
  const { count } = await prisma.subscription.updateMany({ where: { status: "ACTIVE", endsAt: { lte: now } }, data: { status: "EXPIRED" } });
  return count;
}

/**
 * Cancels orders left unpaid for STALE_ORDER_HOURS and their open payments (with history rows).
 * A callback arriving later finds the payment in a final state and is ignored.
 */
export async function cancelStaleOrders(prisma: PrismaClient, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_ORDER_HOURS * 3600 * 1000);
  return prisma.$transaction(async (tx) => {
    const stale = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM orders WHERE status = 'PENDING'::"OrderStatus" AND created_at < ${cutoff} ORDER BY created_at LIMIT 500 FOR UPDATE SKIP LOCKED`;
    if (stale.length === 0) return 0;
    const ids = stale.map((o) => o.id);
    const payments = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM payments WHERE order_id = ANY(${ids}::uuid[]) AND status = 'INITIATED'::"PaymentStatus" FOR UPDATE`;
    if (payments.length) {
      const pids = payments.map((p) => p.id);
      await tx.payment.updateMany({ where: { id: { in: pids } }, data: { status: "CANCELED", failureCode: "expired" } });
      await tx.paymentStatusHistory.createMany({ data: pids.map((paymentId) => ({ paymentId, fromStatus: "INITIATED" as const, toStatus: "CANCELED" as const, reason: "order_expired" })) });
    }
    const { count } = await tx.order.updateMany({ where: { id: { in: ids }, status: "PENDING" }, data: { status: "CANCELED" } });
    return count;
  });
}
