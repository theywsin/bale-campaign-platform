# معماری

## نمای کلی

```
مرورگر ──HTTPS──► Nginx ──► web (Next.js)          [frontend network]
                      └──► api (NestJS) /api/*      [frontend + backend]
                                 │
           ┌─────────────────────┼───────────────────────┐
           ▼                     ▼                       ▼
      PostgreSQL              Redis  ◄── BullMQ ──► worker      [backend: internal]
                                ▲                       │
                            scheduler                   └──► SMTP / (فاز D) API بله  [egress]
```

- **web و api هم‌مبدأ هستند**: Nginx مسیر `/api/` را به API و بقیه را به Next.js می‌فرستد. بنابراین کوکی نشست first-party و `SameSite=Lax` است و CORS در حالت عادی لازم نیست.
- **شبکه `backend` داخلی است** (`internal: true`): PostgreSQL و Redis هیچ پورتی روی میزبان منتشر نمی‌کنند و به اینترنت هم دسترسی ندارند. worker برای SMTP و API بله به شبکه `egress` هم وصل است.
- **کارهای طولانی خارج از درخواست HTTP**: API فقط کار را در صف (BullMQ روی Redis) قرار می‌دهد؛ worker آن را پردازش می‌کند.

## ماژول‌های API

| ماژول | مسئولیت |
|---|---|
| `health` | `GET /api/v1/health` (liveness) و `/health/ready` (دیتابیس + Redis) |
| `auth` | ثبت‌نام، ورود/خروج، CSRF، بازیابی رمز، تأیید ایمیل، `me` |
| `users` | پروفایل، تغییر رمز، نشست‌ها |
| `organizations` | فضای کاری، اعضا، نقش‌ها، دعوت‌نامه |
| `admin` | آمار، کاربران، سازمان‌ها، گزارش ممیزی |
| `audit` | نوشتن AuditLog (داخل تراکنش تغییر یا به‌صورت best-effort) |
| `mail` | ساخت ایمیل‌ها و قرار دادن در صف `email` |

### زنجیره Guardها (به ترتیب)

1. `ThrottlerGuard` — محدودیت نرخ per-IP با شمارنده در Redis (مشترک بین replicaها)
2. `SessionGuard` — همه مسیرها نیازمند نشست‌اند مگر `@Public()`
3. `CsrfGuard` — برای متدهای غیر GET: بررسی Origin و برابری هدر `X-CSRF-Token` با کوکی `bcp_csrf`
4. `PlatformPermissionGuard` — `@RequirePlatformPermission(...)` برای پنل مدیریت
5. `OrgPermissionGuard` — `@RequireOrgPermission(...)` روی مسیرهای `:orgId`؛ عضویت را از دیتابیس می‌خواند و `req.org` را می‌سازد

### جداسازی مشتریان (Multi-tenancy)

- هر داده متعلق به مشتری ستون `organization_id` دارد.
- `OrgPermissionGuard` عضویت کاربر در `:orgId` را بررسی می‌کند. غیرعضو پاسخ **404** می‌گیرد تا وجود سازمان‌های دیگر فاش نشود.
- سرویس‌ها همه کوئری‌ها را با `ctx.organizationId` (حاصل از عضویت تأییدشده) محدود می‌کنند؛ شناسه‌های داخل URL (مثل `memberId`) همیشه همراه با `organizationId` جست‌وجو می‌شوند.
- تست‌های `apps/api/test/tenancy.int.ts` این رفتار را پوشش می‌دهند.
- RLS در PostgreSQL به‌عنوان لایه دفاعی دوم برای فاز F برنامه‌ریزی شده است (نیازمند تنظیم `SET LOCAL app.organization_id` در هر تراکنش).

### نقش‌ها و مجوزها

منبع واحد: `packages/shared/src/permissions.ts` — هم API و هم UI از آن استفاده می‌کنند (UI فقط برای نمایش؛ تصمیم نهایی همیشه سمت سرور است).

| نقش سازمانی | توان |
|---|---|
| ORGANIZATION_OWNER | همه، از جمله حذف سازمان و پرداخت |
| ORGANIZATION_ADMIN | مدیریت اعضا (به‌جز مالک)، تنظیمات، ارسال کمپین |
| ORGANIZATION_MEMBER | خواندن و کارهای روزمره |

نقش‌های سامانه: SUPER_ADMIN، ADMIN، SUPPORT، BILLING_ADMIN، MODERATOR. SUPPORT به‌صورت پیش‌فرض به اسرار حساب‌های پیام‌رسان و اطلاعات حساس پرداخت دسترسی ندارد.

## وب

- همه صفحات پنل client-side هستند و فقط از طریق `lib/api.ts` با API صحبت می‌کنند (same-origin، کوکی httpOnly، هدر CSRF).
- `middleware.ts` فقط وجود کوکی نشست را بررسی و به `/login` هدایت می‌کند؛ اعتبار واقعی را API می‌سنجد.
- فرم‌ها: React Hook Form + اسکیماهای Zod مشترک؛ خطاهای فیلدی سرور هم روی فرم نمایش داده می‌شوند.
- بخش‌هایی که ساخته نشده‌اند در منو غیرفعال و با برچسب «به‌زودی» هستند؛ هیچ لینک مرده یا داده ساختگی وجود ندارد.

## worker و scheduler

- **worker**: صف `email` را با nodemailer پردازش می‌کند (retry نمایی، ۵ تلاش). بدون `SMTP_URL` صف پردازش نمی‌شود و API هم چیزی در صف نمی‌گذارد.
- **scheduler**: هر ساعت نشست‌ها، توکن‌ها و دعوت‌نامه‌های منقضی را حذف می‌کند (با قفل Redis برای جلوگیری از اجرای هم‌زمان).
- پردازش کمپین و Transactional Outbox در فاز C به این دو سرویس اضافه می‌شود.
