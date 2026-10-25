# برنامه پیاده‌سازی — Bale Campaign Platform

این سند وضعیت واقعی پروژه را نگه می‌دارد. هر فاز فقط وقتی «انجام‌شده» علامت می‌خورد که تست‌های آن واقعاً اجرا و موفق شده باشند.

## ۰. بررسی محیط (۲۰۲۶-۱۰-۲۵)

| مورد | نتیجه |
|---|---|
| مخزن | `theywsin/bale-campaign-platform`، خالی در شروع |
| Node.js / npm | v22.22.0 / 10.9.4 (Node 22 LTS) |
| Docker / Compose | 29.9.2 / v5.6.1 (daemon در محیط توسعه دستی راه‌اندازی شد) |
| PostgreSQL / Redis | از طریق Docker (`postgres:17-alpine`، `redis:7-alpine`) |
| دسترسی شبکه | رجیستری npm و Docker Hub در دسترس است؛ `tapi.bale.ai` از محیط توسعه **در دسترس نیست** (پروکسی 403) |
| پورت‌ها (توسعه) | web 3000، api 4000، worker health 4100، scheduler health 4200، postgres 5432 و redis 6379 فقط روی `127.0.0.1` |

## انتخاب نسخه‌ها و دلیل آن

| بخش | نسخه | دلیل |
|---|---|---|
| Node.js | 22 LTS | نسخه محیط تست؛ تا آوریل ۲۰۲۷ پشتیبانی امنیتی دارد |
| TypeScript | 5.9.x | TypeScript 7 (کامپایلر جدید) هنوز با ts-jest و ابزارهای Nest سازگاری کامل ندارد |
| Next.js | 15.5.x (خط backport که فعالانه وصله می‌شود) | پایدار و سازگار با React 19 |
| NestJS | 11.x (خط `legacy` که هنوز وصله می‌شود) | NestJS 12 تازه منتشر شده و اکوسیستم پلاگین‌ها هنوز کامل با آن هماهنگ نیست |
| Prisma | 7.x با `@prisma/adapter-pg` | Prisma 6 دیگر به‌روز نمی‌شود |
| Tailwind CSS | 4.x | نسخه جاری |
| BullMQ | 5.x | خط پایدار و پرکاربرد |

نسخه دقیق همه وابستگی‌ها در `package.json` ها بدون `^` ثابت شده و `package-lock.json` در مخزن است.

## ساختار

```
apps/web         Next.js App Router، پنل مشتری، پنل ادمین، صفحات عمومی
apps/api         NestJS REST API نسخه v1 + Swagger
apps/worker      پردازشگر صف (BullMQ) — پردازش کمپین از فاز C
apps/scheduler   زمان‌بند و انتشار Outbox — از فاز C
packages/database  Prisma Client مشترک
packages/shared    نقش‌ها، مجوزها، اسکیماهای Zod، ماشین وضعیت‌ها
packages/messaging (فاز D) قرارداد MessagingProvider
packages/licensing (فاز E)
prisma/          schema.prisma و migrations
infra/           Dockerfile ها، nginx، اسکریپت بکاپ/ریستور
tests/e2e        تست‌های Playwright
docs/            مستندات
```

## فازها و معیار پذیرش

### فاز A — زیرساخت
- Monorepo با npm workspaces، TypeScript strict
- Next.js، NestJS، worker، scheduler قابل build
- Prisma + اولین migration
- Docker Compose (web, api, worker, scheduler, postgres, redis, migrate)، شبکه داخلی، بدون انتشار پورت DB/Redis
- Health check: `GET /api/v1/health` (liveness) و `/api/v1/health/ready` (DB + Redis)

**پذیرش:** `npm run build` موفق، `docker compose config` موفق، `docker compose up` همه سرویس‌ها healthy، migration اجرا شود، health API پاسخ 200 بدهد، صفحه وب باز شود.

### فاز B — هسته SaaS
- ثبت‌نام، ورود، خروج، بازیابی رمز، تأیید ایمیل (در صورت پیکربندی SMTP)، تغییر رمز، مدیریت نشست‌ها
- نشست سمت سرور در دیتابیس + کوکی httpOnly؛ CSRF به روش double-submit + بررسی Origin
- Argon2id برای رمز
- محدودسازی تلاش ورود (Redis) و Rate Limit عمومی
- سازمان‌ها، اعضا، دعوت‌نامه، نقش‌ها و RBAC (نقش + عضویت + مالکیت منبع)
- AuditLog و رویدادهای امنیتی
- پنل فارسی RTL: صفحات عمومی، احراز هویت، داشبورد، تنظیمات فضای کاری، اعضا، پروفایل و امنیت؛ پنل ادمین: داشبورد، کاربران، سازمان‌ها، گزارش ممیزی

**پذیرش:** تست‌های unit و integration (ثبت‌نام/ورود، جداسازی سازمان، دسترسی ادمین، Rate Limit، CSRF، عدم افشای اسرار) و E2E (ثبت‌نام، ورود، ایجاد فضای کاری) موفق.

### فاز C — مخاطبان و کمپین
Contact، ContactList، SuppressionEntry، ورود/خروج CSV (با جلوگیری از CSV Injection)، Campaign و CampaignRecipient، Transactional Outbox، صف BullMQ، توقف/ادامه، Retry فقط برای خطاهای قابل‌تکرار، وضعیت UNKNOWN بدون ارسال مجدد خودکار.

### فاز D — اتصال پیام‌رسان
`MessagingProvider`، `MockMessagingProvider` (فقط تست، با برچسب آزمایشی در UI)، پیاده‌سازی Bale Bot API فقط برای قابلیت‌های مستند. نتایج اولیه بررسی مستندات در `BALE_INTEGRATION.md` (در فاز D کامل می‌شود):
- API رسمی بازو: `https://tapi.bale.ai/bot<token>/<method>` (منبع: https://docs.bale.ai/)
- رسید تحویل/خواندن در مستندات وجود ندارد ⇒ وضعیت DELIVERED برای بله قابل‌تأیید نیست و حداکثر ACCEPTED ثبت می‌شود.
- امکان ارسال به کاربری که بازو را شروع نکرده در مستندات ذکر نشده ⇒ پشتیبانی‌نشده فرض می‌شود.
- محدودیت نرخ در مستندات ذکر نشده ⇒ نرخ محافظه‌کارانه و قابل‌تنظیم.
- اتصال حساب شخصی با پروتکل غیررسمی پیاده‌سازی نمی‌شود.

### فاز E — فروش
Plan، Subscription، Order، Payment (با تاریخچه وضعیت)، WebhookEvent idempotent، MockPaymentProvider، License با هش کلید، پنل ادمین کامل.

### فاز F — انتشار
تست امنیت، تست بکاپ/ریستور، تست بار، استقرار آزمایشی، مستندات نهایی.

## ریسک‌ها

| ریسک | راهکار |
|---|---|
| API بله رسید تحویل ندارد و ارسال فقط به چت‌هایی که بازو را آغاز کرده‌اند ممکن است | محدودیت در محصول اعلام می‌شود؛ مدل داده بین ACCEPTED و DELIVERED تفاوت قائل است |
| `tapi.bale.ai` از محیط توسعه در دسترس نیست | اتصال واقعی فقط با Mock تست می‌شود و تا تأیید، غیرفعال می‌ماند |
| درگاه پرداخت مشخص نشده | فقط Interface + MockPaymentProvider |
| ارسال ایمیل (SMTP) پیکربندی نشده | بدون SMTP، ایمیل ارسال نمی‌شود و تأیید ایمیل اختیاری است؛ توکن‌ها هرگز لاگ نمی‌شوند |
| RLS در PostgreSQL پیچیدگی تراکنش‌ها را بالا می‌برد | فاز B: کنترل سطح برنامه با تست؛ RLS به‌عنوان لایه دفاعی دوم در فاز F |

## وضعیت

| فاز | وضعیت |
|---|---|
| A | انجام‌شده — build، `docker compose config`، اجرای همه سرویس‌ها (healthy)، migration و health check تست شد |
| B | شروع‌نشده |
| C–F | شروع‌نشده |
