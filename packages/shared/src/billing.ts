import { z } from "zod";
import { paginationQuerySchema } from "./schemas";

export const PAYMENT_STATUSES = ["INITIATED", "SUCCEEDED", "FAILED", "CANCELED"] as const;
export type PaymentStatusValue = (typeof PAYMENT_STATUSES)[number];

/** Allowed payment transitions. Final states never change, so a late or replayed callback cannot flip a result. */
const PAYMENT_TRANSITIONS: Record<PaymentStatusValue, readonly PaymentStatusValue[]> = {
  INITIATED: ["SUCCEEDED", "FAILED", "CANCELED"],
  SUCCEEDED: [],
  FAILED: [],
  CANCELED: [],
};

export function canTransitionPayment(from: PaymentStatusValue, to: PaymentStatusValue): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export const PLAN_LIMIT_KEYS = ["maxContacts", "maxMonthlyMessages", "maxMessagingAccounts", "maxMembers"] as const;
export type PlanLimitKey = (typeof PLAN_LIMIT_KEYS)[number];
export type PlanLimits = Record<PlanLimitKey, number | null>;

export const PLAN_LIMIT_LABELS: Record<PlanLimitKey, string> = {
  maxContacts: "مخاطب",
  maxMonthlyMessages: "پیام در ماه",
  maxMessagingAccounts: "حساب ارسال",
  maxMembers: "عضو",
};

/** Whether adding `adding` items to `used` stays within `limit` (null = unlimited). */
export function withinLimit(limit: number | null, used: number, adding = 1): boolean {
  return limit === null || used + adding <= limit;
}

const DAY_MS = 24 * 3600 * 1000;

/**
 * What a purchase or license grants. Renewing the plan the organization already has extends the
 * current subscription's end date; any other plan replaces the current subscription from now.
 */
export function nextSubscriptionPeriod(
  now: Date,
  periodDays: number,
  current: { planId: string; endsAt: Date } | null,
  planId: string,
): { extendsCurrent: boolean; endsAt: Date } {
  const extendsCurrent = current !== null && current.planId === planId && current.endsAt > now;
  const from = extendsCurrent ? current.endsAt : now;
  return { extendsCurrent, endsAt: new Date(from.getTime() + periodDays * DAY_MS) };
}

/** Rials as Persian digits with thousands separators, e.g. «۱٬۲۰۰٬۰۰۰ ریال». */
export function formatRials(amount: string | number | bigint): string {
  return `${BigInt(amount).toLocaleString("fa-IR")} ریال`;
}

/** Start of the current calendar month in UTC; monthly message quotas reset here. */
export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** "" means unlimited (null); undefined stays undefined so partial updates leave the field alone. */
const optionalLimit = z.preprocess(
  (v) => (v === "" ? null : v),
  z.coerce.number({ error: "عدد نامعتبر است." }).int("عدد صحیح وارد کنید.").min(0).max(100_000_000).nullable(),
);

const planFields = {
  name: z.string({ error: "نام پلن الزامی است." }).trim().min(2, "نام پلن کوتاه است.").max(100),
  description: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(500).nullish()),
  priceRials: z.coerce
    .number({ error: "قیمت نامعتبر است." })
    .int("قیمت باید عدد صحیح باشد.")
    .min(0, "قیمت نمی‌تواند منفی باشد.")
    .max(1_000_000_000_000),
  periodDays: z.coerce.number({ error: "مدت نامعتبر است." }).int().min(1, "حداقل ۱ روز.").max(3660),
  maxContacts: optionalLimit,
  maxMonthlyMessages: optionalLimit,
  maxMessagingAccounts: optionalLimit,
  maxMembers: optionalLimit,
  isPublic: z.boolean(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(10_000),
};

export const planInputSchema = z.object({
  ...planFields,
  code: z
    .string({ error: "کد پلن الزامی است." })
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,48}$/, "کد فقط حروف انگلیسی کوچک، عدد و خط تیره."),
  maxContacts: optionalLimit.default(null),
  maxMonthlyMessages: optionalLimit.default(null),
  maxMessagingAccounts: optionalLimit.default(null),
  maxMembers: optionalLimit.default(null),
  isPublic: z.boolean().default(true),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  sortOrder: planFields.sortOrder.default(0),
});
export type PlanInput = z.input<typeof planInputSchema>;
/** Only the fields sent are changed. */
export const updatePlanSchema = z.object(planFields).partial();

export const createOrderSchema = z.object({ planId: z.uuid({ error: "پلن را انتخاب کنید." }) });

export const mockCheckoutSchema = z.object({ outcome: z.enum(["SUCCEEDED", "FAILED", "CANCELED"]) });

export const createLicensesSchema = z.object({
  planId: z.uuid({ error: "پلن را انتخاب کنید." }),
  periodDays: z.coerce.number().int().min(1).max(3660),
  count: z.coerce.number().int().min(1, "حداقل ۱.").max(100, "حداکثر ۱۰۰ کلید در هر بار."),
  note: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(200).nullish()),
  redeemableDays: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().int().min(1).max(3660).nullish()),
});

/** Keys look like BCP-XXXX-XXXX-XXXX-XXXX (Crockford base32, no I/L/O/U). */
export const LICENSE_KEY_PATTERN = /^BCP(-[0-9A-HJKMNP-TV-Z]{4}){4}$/;
export const redeemLicenseSchema = z.object({
  key: z
    .string({ error: "کلید لایسنس الزامی است." })
    .trim()
    .toUpperCase()
    .regex(LICENSE_KEY_PATTERN, "قالب کلید لایسنس معتبر نیست."),
});

export const adminSubscriptionSchema = z.object({
  planId: z.uuid({ error: "پلن را انتخاب کنید." }),
  periodDays: z.coerce.number().int().min(1).max(3660),
});

export const billingListQuerySchema = paginationQuerySchema.extend({
  status: z.string().trim().max(20).optional(),
});
