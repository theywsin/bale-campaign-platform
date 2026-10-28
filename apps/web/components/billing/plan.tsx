import { formatRials, PLAN_LIMIT_KEYS, PLAN_LIMIT_LABELS, type PlanInfo } from "@bcp/shared";
import { formatNumber } from "@/lib/format";

export const planPrice = (p: Pick<PlanInfo, "priceRials">) => (p.priceRials === "0" ? "رایگان" : formatRials(p.priceRials));

export const planPeriod = (days: number) => (days % 365 === 0 ? `${formatNumber(days / 365)} سال` : days % 30 === 0 ? `${formatNumber(days / 30)} ماه` : `${formatNumber(days)} روز`);

/** Limits as a list; null means unlimited. */
export function PlanLimits({ plan }: { plan: Pick<PlanInfo, "maxContacts" | "maxMonthlyMessages" | "maxMessagingAccounts" | "maxMembers"> }) {
  return (
    <ul className="space-y-1 text-sm text-slate-700">
      {PLAN_LIMIT_KEYS.map((k) => (
        <li key={k}>
          {plan[k] === null ? "نامحدود" : formatNumber(plan[k])} {PLAN_LIMIT_LABELS[k]}
        </li>
      ))}
    </ul>
  );
}

export const ORDER_STATUS = { PENDING: ["در انتظار پرداخت", "amber"], PAID: ["پرداخت‌شده", "green"], FAILED: ["ناموفق", "red"], CANCELED: ["لغوشده", "slate"] } as const;
export const SUBSCRIPTION_SOURCE = { PAYMENT: "خرید آنلاین", LICENSE: "کلید لایسنس", ADMIN: "اعطا توسط پشتیبانی" } as const;
export const SUBSCRIPTION_STATUS = { ACTIVE: ["فعال", "green"], EXPIRED: ["منقضی", "slate"], CANCELED: ["لغوشده", "red"] } as const;
