import { z } from "zod";
import { paginationQuerySchema } from "./schemas";

export const TICKET_STATUSES = ["OPEN", "ANSWERED", "CLOSED"] as const;
export const TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
export const TICKET_CATEGORIES = ["TECHNICAL", "BILLING", "ACCOUNT", "OTHER"] as const;

export const TICKET_STATUS_LABELS: Record<(typeof TICKET_STATUSES)[number], string> = {
  OPEN: "در انتظار پاسخ پشتیبانی",
  ANSWERED: "پاسخ داده شد",
  CLOSED: "بسته",
};
export const TICKET_PRIORITY_LABELS: Record<(typeof TICKET_PRIORITIES)[number], string> = { LOW: "کم", NORMAL: "عادی", HIGH: "زیاد" };
export const TICKET_CATEGORY_LABELS: Record<(typeof TICKET_CATEGORIES)[number], string> = {
  TECHNICAL: "فنی و ارسال",
  BILLING: "اشتراک و پرداخت",
  ACCOUNT: "حساب کاربری",
  OTHER: "سایر",
};

const body = z
  .string({ error: "متن پیام الزامی است." })
  .trim()
  .min(2, "متن پیام کوتاه است.")
  .max(5000, "متن پیام حداکثر ۵۰۰۰ کاراکتر است.");

export const createTicketSchema = z.object({
  subject: z.string({ error: "موضوع الزامی است." }).trim().min(3, "موضوع کوتاه است.").max(150, "موضوع حداکثر ۱۵۰ کاراکتر است."),
  category: z.enum(TICKET_CATEGORIES, { error: "دسته را انتخاب کنید." }),
  priority: z.enum(TICKET_PRIORITIES).default("NORMAL"),
  body,
});
export type CreateTicketInput = z.input<typeof createTicketSchema>;

export const ticketReplySchema = z.object({ body });
export type TicketReplyInput = z.input<typeof ticketReplySchema>;

export const adminTicketUpdateSchema = z
  .object({ status: z.enum(TICKET_STATUSES).optional(), priority: z.enum(TICKET_PRIORITIES).optional() })
  .refine((v) => v.status !== undefined || v.priority !== undefined, { message: "تغییری ارسال نشده است." });

export const ticketListQuerySchema = paginationQuerySchema.extend({ status: z.enum(TICKET_STATUSES).optional() });

// ---- two-factor authentication ----------------------------------------------

/** A 6-digit TOTP code, or a recovery code (XXXXX-XXXXX). Persian digits are accepted. */
export const mfaCodeSchema = z
  .string({ error: "کد را وارد کنید." })
  .transform((v) => v.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\s/g, "").toUpperCase())
  .pipe(z.string().regex(/^(\d{6}|[0-9A-Z]{5}-[0-9A-Z]{5})$/, "کد نامعتبر است."));

export const totpConfirmSchema = z.object({ code: mfaCodeSchema });
export const totpDisableSchema = z.object({ password: z.string().min(1, "رمز عبور را وارد کنید.").max(200), code: mfaCodeSchema });
export const mfaLoginSchema = z.object({ mfaToken: z.string().min(20).max(100), code: mfaCodeSchema });

// ---- system settings -------------------------------------------------------------

export const systemSettingsSchema = z.object({
  /** When false, /auth/register is refused (invitations still work for existing users). */
  registrationEnabled: z.boolean(),
  /** Banner shown at the top of every customer panel page; empty = none. */
  announcement: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(300, "حداکثر ۳۰۰ کاراکتر.").nullable()),
  /** Contact address shown on the support page; empty = hidden. */
  supportEmail: z.preprocess((v) => (v === "" ? null : v), z.email("ایمیل نامعتبر است.").nullable()),
});
export type SystemSettings = z.infer<typeof systemSettingsSchema>;
export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = { registrationEnabled: true, announcement: null, supportEmail: null };
