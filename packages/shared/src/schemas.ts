import { z } from "zod";
import { ORGANIZATION_ROLES } from "./roles";

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
