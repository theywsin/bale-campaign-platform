const dateTime = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" });
const date = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" });
const number = new Intl.NumberFormat("fa-IR");

export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTime.format(new Date(iso)) : "—");
export const formatDate = (iso: string | null | undefined) => (iso ? date.format(new Date(iso)) : "—");
export const formatNumber = (n: number) => number.format(n);

/** Persian labels for audit actions shown in the panels. */
export const ACTION_LABELS: Record<string, string> = {
  "auth.register": "ثبت‌نام",
  "auth.login.success": "ورود موفق",
  "auth.login.failed": "ورود ناموفق",
  "auth.login.locked": "مسدودشدن موقت ورود",
  "auth.login.suspended": "تلاش ورود حساب تعلیق‌شده",
  "auth.logout": "خروج",
  "auth.password_reset.requested": "درخواست بازیابی رمز",
  "auth.password_reset.completed": "بازیابی رمز",
  "auth.password.changed": "تغییر رمز",
  "auth.password_change.failed": "تغییر رمز ناموفق",
  "auth.email.verified": "تأیید ایمیل",
  "auth.session.revoked": "پایان نشست",
  "auth.session.revoked_others": "پایان سایر نشست‌ها",
  "org.created": "ایجاد فضای کاری",
  "org.updated": "ویرایش فضای کاری",
  "org.invitation.created": "ارسال دعوت‌نامه",
  "org.invitation.revoked": "لغو دعوت‌نامه",
  "org.invitation.accepted": "پذیرش دعوت‌نامه",
  "org.member.role_changed": "تغییر نقش عضو",
  "org.member.removed": "حذف عضو",
  "org.member.left": "خروج عضو",
  "admin.user.status_changed": "تغییر وضعیت کاربر",
  "admin.cli.user_created": "ایجاد مدیر از خط فرمان",
  "admin.cli.role_granted": "اعطای نقش مدیریتی از خط فرمان",
  "contact.created": "افزودن مخاطب",
  "contact.updated": "ویرایش مخاطب",
  "contact.archived": "بایگانی مخاطب",
  "contact.restored": "بازگردانی مخاطب",
  "contact.deleted": "حذف مخاطب",
  "contacts.imported": "ورود مخاطبان از CSV",
  "contacts.exported": "خروجی CSV مخاطبان",
  "list.created": "ایجاد فهرست",
  "list.updated": "ویرایش فهرست",
  "list.deleted": "حذف فهرست",
  "suppression.added": "افزودن به فهرست عدم ارسال",
  "suppression.removed": "حذف از فهرست عدم ارسال",
  "messaging_account.created": "افزودن حساب پیام‌رسان",
  "messaging_account.enabled": "فعال‌کردن حساب پیام‌رسان",
  "messaging_account.disabled": "غیرفعال‌کردن حساب پیام‌رسان",
  "messaging_account.deleted": "حذف حساب پیام‌رسان",
  "campaign.created": "ایجاد کمپین",
  "campaign.updated": "ویرایش کمپین",
  "campaign.deleted": "حذف کمپین",
  "campaign.started": "شروع کمپین",
  "campaign.scheduled": "زمان‌بندی کمپین",
  "campaign.paused": "توقف کمپین",
  "campaign.resumed": "ادامه کمپین",
  "campaign.cancelled": "لغو کمپین",
};
export const actionLabel = (a: string) => ACTION_LABELS[a] ?? a;
