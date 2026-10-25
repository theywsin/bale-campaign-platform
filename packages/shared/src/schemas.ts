import { z } from "zod";
import { ORGANIZATION_ROLES } from "./roles";
import { normalizeChatId, normalizePhone } from "./phone";
import { RECIPIENT_STATUSES } from "./campaign";

/** Error messages are user facing and therefore Persian. */

export const emailSchema = z
  .string({ error: "ایمیل الزامی است." })
  .trim()
  .toLowerCase()
  .max(254, "ایمیل بیش از حد طولانی است.")
  .pipe(z.email({ error: "ایمیل معتبر نیست." }));

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
  .string({ error: "رمز عبور الزامی است." })
  .min(PASSWORD_MIN_LENGTH, `رمز عبور باید حداقل ${PASSWORD_MIN_LENGTH} کاراکتر باشد.`)
  .max(PASSWORD_MAX_LENGTH, `رمز عبور حداکثر ${PASSWORD_MAX_LENGTH} کاراکتر است.`)
  .refine((v) => /[A-Za-z؀-ۿ]/.test(v) && /\d|[۰-۹]/.test(v), {
    message: "رمز عبور باید شامل حداقل یک حرف و یک عدد باشد.",
  });

export const fullNameSchema = z
  .string({ error: "نام الزامی است." })
  .trim()
  .min(2, "نام باید حداقل ۲ کاراکتر باشد.")
  .max(100, "نام حداکثر ۱۰۰ کاراکتر است.")
  .refine((v) => !/[<>]/.test(v), { message: "نام شامل کاراکتر غیرمجاز است." });

export const organizationNameSchema = z
  .string({ error: "نام فضای کاری الزامی است." })
  .trim()
  .min(2, "نام فضای کاری باید حداقل ۲ کاراکتر باشد.")
  .max(100, "نام فضای کاری حداکثر ۱۰۰ کاراکتر است.")
  .refine((v) => !/[<>]/.test(v), { message: "نام شامل کاراکتر غیرمجاز است." });

export const registerSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
  organizationName: organizationNameSchema,
  acceptTerms: z.literal(true, { error: "پذیرش شرایط استفاده الزامی است." }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: "رمز عبور الزامی است." }).min(1, "رمز عبور الزامی است.").max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

const tokenSchema = z.string().min(20).max(200).regex(/^[A-Za-z0-9_-]+$/, "توکن نامعتبر است.");

export const resetPasswordSchema = z.object({
  token: tokenSchema,
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({ token: tokenSchema });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "رمز فعلی الزامی است.").max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "رمز جدید باید با رمز فعلی متفاوت باشد.",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const updateProfileSchema = z.object({ fullName: fullNameSchema });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const createOrganizationSchema = z.object({ name: organizationNameSchema });
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z.object({ name: organizationNameSchema });
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const organizationRoleSchema = z.enum(ORGANIZATION_ROLES, { error: "نقش نامعتبر است." });

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: organizationRoleSchema,
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({ role: organizationRoleSchema });
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export const acceptInvitationSchema = z.object({ token: tokenSchema });

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const adminUpdateUserStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"], { error: "وضعیت نامعتبر است." }),
});

// ---------------------------------------------------------------------------
// Contacts, lists, suppression
// ---------------------------------------------------------------------------

const optionalName = (label: string) =>
  z
    .string()
    .trim()
    .max(100, `${label} حداکثر ۱۰۰ کاراکتر است.`)
    .refine((v) => !/[<>]/.test(v), { message: `${label} شامل کاراکتر غیرمجاز است.` })
    .transform((v) => (v === "" ? null : v))
    .nullish();

export const phoneInputSchema = z
  .string()
  .trim()
  .max(30)
  .transform((v, ctx) => {
    if (v === "") return null;
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "شماره موبایل معتبر نیست." });
      return z.NEVER;
    }
    return n;
  })
  .nullish();

export const chatIdInputSchema = z
  .string()
  .trim()
  .max(30)
  .transform((v, ctx) => {
    if (v === "") return null;
    const n = normalizeChatId(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "شناسه چت بله باید عدد باشد." });
      return z.NEVER;
    }
    return n;
  })
  .nullish();

export const CONSENT_STATUSES = ["UNKNOWN", "OPTED_IN", "OPTED_OUT"] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];
export const CONSENT_LABELS_FA: Record<ConsentStatus, string> = {
  UNKNOWN: "نامشخص",
  OPTED_IN: "رضایت داده",
  OPTED_OUT: "انصراف داده",
};

const contactFields = {
  firstName: optionalName("نام"),
  lastName: optionalName("نام خانوادگی"),
  phone: phoneInputSchema,
  baleChatId: chatIdInputSchema,
  notes: z
    .string()
    .trim()
    .max(1000, "یادداشت حداکثر ۱۰۰۰ کاراکتر است.")
    .transform((v) => (v === "" ? null : v))
    .nullish(),
  consent: z.enum(CONSENT_STATUSES, { error: "وضعیت رضایت نامعتبر است." }).optional(),
};

export const createContactSchema = z
  .object(contactFields)
  .refine((c) => Boolean(c.phone || c.baleChatId), {
    message: "حداقل یکی از شماره موبایل یا شناسه چت بله لازم است.",
    path: ["phone"],
  });
export type CreateContactInput = z.input<typeof createContactSchema>;

export const updateContactSchema = z.object(contactFields).partial();
export type UpdateContactInput = z.input<typeof updateContactSchema>;

export const contactListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
  listId: z.uuid().optional(),
});
export type ContactListQuery = z.infer<typeof contactListQuerySchema>;

const listName = z
  .string({ error: "نام فهرست الزامی است." })
  .trim()
  .min(1, "نام فهرست الزامی است.")
  .max(100, "نام فهرست حداکثر ۱۰۰ کاراکتر است.")
  .refine((v) => !/[<>]/.test(v), { message: "نام شامل کاراکتر غیرمجاز است." });

export const createContactListSchema = z.object({
  name: listName,
  description: z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v === "" ? null : v))
    .nullish(),
});
export type CreateContactListInput = z.input<typeof createContactListSchema>;

export const listMembershipSchema = z.object({
  contactIds: z.array(z.uuid({ error: "شناسه مخاطب نامعتبر است." })).min(1).max(500),
});
export type ListMembershipInput = z.infer<typeof listMembershipSchema>;

export const createSuppressionSchema = z
  .object({
    phone: phoneInputSchema,
    baleChatId: chatIdInputSchema,
    reason: z.string().trim().max(200).optional(),
  })
  .refine((s) => Boolean(s.phone) !== Boolean(s.baleChatId), {
    message: "دقیقاً یکی از شماره موبایل یا شناسه چت بله را وارد کنید.",
    path: ["phone"],
  });
export type CreateSuppressionInput = z.input<typeof createSuppressionSchema>;

/** Limits for CSV import (enforced by the API, shown in the UI). */
export const CSV_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const CSV_IMPORT_MAX_ROWS = 10_000;

// ---------------------------------------------------------------------------
// Messaging accounts and campaigns
// ---------------------------------------------------------------------------

export const MESSAGING_PROVIDERS = ["MOCK", "BALE_BOT"] as const;
export type MessagingProviderType = (typeof MESSAGING_PROVIDERS)[number];

export const createMockAccountSchema = z.object({
  displayName: z
    .string({ error: "نام حساب الزامی است." })
    .trim()
    .min(2, "نام حساب باید حداقل ۲ کاراکتر باشد.")
    .max(100)
    .refine((v) => !/[<>]/.test(v), { message: "نام شامل کاراکتر غیرمجاز است." }),
  rateLimitPerMinute: z.coerce.number().int().min(1).max(600).default(60),
});
export type CreateMockAccountInput = z.input<typeof createMockAccountSchema>;

/** Conservative limit; Bale's documented maximum is confirmed in phase D. */
export const CAMPAIGN_MESSAGE_MAX_LENGTH = 4000;

const campaignFields = {
  name: z
    .string({ error: "نام کمپین الزامی است." })
    .trim()
    .min(2, "نام کمپین باید حداقل ۲ کاراکتر باشد.")
    .max(150, "نام کمپین حداکثر ۱۵۰ کاراکتر است.")
    .refine((v) => !/[<>]/.test(v), { message: "نام شامل کاراکتر غیرمجاز است." }),
  messageText: z
    .string({ error: "متن پیام الزامی است." })
    .trim()
    .min(1, "متن پیام الزامی است.")
    .max(CAMPAIGN_MESSAGE_MAX_LENGTH, `متن پیام حداکثر ${CAMPAIGN_MESSAGE_MAX_LENGTH} کاراکتر است.`),
  messagingAccountId: z.uuid({ error: "حساب ارسال را انتخاب کنید." }),
  /** Empty string (the "all contacts" option in forms) means no list. */
  listId: z.preprocess((v) => (v === "" ? null : v), z.uuid({ error: "فهرست نامعتبر است." }).nullish()),
};

export const createCampaignSchema = z.object(campaignFields);
export type CreateCampaignInput = z.input<typeof createCampaignSchema>;
export const updateCampaignSchema = z.object(campaignFields).partial();
export type UpdateCampaignInput = z.input<typeof updateCampaignSchema>;

export const startCampaignSchema = z.object({
  /** ISO timestamp in the future; omitted = send now. */
  scheduledAt: z.iso
    .datetime({ offset: true, error: "زمان نامعتبر است." })
    .optional()
    .refine((v) => !v || new Date(v).getTime() > Date.now() - 60_000, { message: "زمان ارسال باید در آینده باشد." }),
});
export type StartCampaignInput = z.infer<typeof startCampaignSchema>;

export const recipientQuerySchema = paginationQuerySchema.extend({
  status: z.enum(RECIPIENT_STATUSES).optional(),
});
