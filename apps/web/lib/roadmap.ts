/** Single source for what is actually available, shown on public pages. Update as phases ship. */
export const MODULES: { title: string; description: string; status: "available" | "in-progress" | "planned" }[] = [
  { title: "حساب کاربری و امنیت", description: "ثبت‌نام، ورود، بازیابی رمز، مدیریت نشست‌ها و محدودسازی تلاش‌های ورود.", status: "available" },
  { title: "فضای کاری تیمی", description: "چند فضای کاری مستقل، دعوت اعضا و نقش‌های مالک، مدیر و عضو.", status: "available" },
  { title: "گزارش ممیزی", description: "ثبت رویدادهای حساس امنیتی و سازمانی.", status: "available" },
  { title: "مدیریت مخاطبان", description: "فهرست‌ها، ورود از CSV، تشخیص تکرار و فهرست عدم ارسال.", status: "available" },
  { title: "کمپین و صف ارسال", description: "زمان‌بندی، توقف و ادامه، و گزارش وضعیت هر گیرنده.", status: "available" },
  { title: "اتصال به بله", description: "فقط از طریق API رسمی بازوی بله؛ ارسال به کاربرانی که بازو را شروع کرده‌اند.", status: "available" },
  { title: "اشتراک و پرداخت", description: "پلن‌ها با سقف مصرف، خرید و تمدید، و فعال‌سازی با کلید لایسنس. اتصال به درگاه بانکی واقعی هنوز انجام نشده است.", status: "in-progress" },
];

export const STATUS_LABEL = { available: "فعال", "in-progress": "در حال توسعه", planned: "برنامه‌ریزی‌شده" } as const;
