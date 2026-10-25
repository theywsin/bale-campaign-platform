# دیتابیس

PostgreSQL 17، Prisma 7 (با driver adapter `@prisma/adapter-pg`). اسکیما: [prisma/schema.prisma](prisma/schema.prisma).

## قراردادها

- کلید اصلی: UUID نسخه ۷ (`uuid(7)`) — ترتیب زمانی دارد و ایندکس‌ها را پراکنده نمی‌کند.
- زمان‌ها: `timestamptz(3)`، همیشه UTC. کانتینر PostgreSQL با `TZ=UTC` اجرا می‌شود.
- نام جدول‌ها و ستون‌ها snake_case (`@@map` / `@map`).
- ایمیل‌ها همیشه lower-case و trim شده ذخیره می‌شوند (اعتبارسنجی Zod)؛ بنابراین unique ساده کافی است.
- توکن‌ها (نشست، بازیابی رمز، دعوت) هرگز خام ذخیره نمی‌شوند؛ فقط SHA-256 آن‌ها (`char(64)`).

## جدول‌ها (فاز A و B)

| جدول | توضیح | قیود و ایندکس‌های مهم |
|---|---|---|
| `users` | کاربران؛ `password_hash` با Argon2id؛ `platform_role` برای کارکنان | `email` unique |
| `sessions` | نشست وب سمت سرور | `token_hash` unique؛ `(user_id, revoked_at)`؛ `expires_at` |
| `user_tokens` | توکن‌های یک‌بارمصرف ایمیل | `token_hash` unique؛ `(user_id, purpose)` |
| `organizations` | مشتری (tenant) | `slug` unique؛ `(status, created_at)` |
| `organization_members` | عضویت و نقش | `(organization_id, user_id)` unique |
| `invitations` | دعوت‌نامه | `token_hash` unique؛ **partial unique** `(organization_id, email) WHERE status='PENDING'` |
| `audit_logs` | گزارش ممیزی، فقط افزودنی | trigger مانع UPDATE؛ ایندکس‌های `(organization_id, created_at desc)` و ... |
| `system_settings` | تنظیمات کلیدی سامانه | — |

مدل‌های فاز C تا E (Contact، Campaign، MessageAttempt، Plan، Subscription، License، Payment، WebhookEvent، SupportTicket و ...) با migrationهای جدید اضافه می‌شوند.

## Migrationها

| Migration | محتوا |
|---|---|
| `20261025114633_init` | `system_settings` |
| `20261025120430_identity_and_organizations` | کاربران، نشست‌ها، سازمان‌ها، دعوت‌نامه، audit + ایندکس partial و trigger دستی |
| `20261025121000_audit_log_allow_org_set_null` | اجازه به `ON DELETE SET NULL` روی audit در حذف سخت سازمان |

دستورها:

```bash
npm run db:migrate:dev -- --name <name>   # فقط توسعه: ساخت migration جدید
npm run db:migrate:deploy                 # اعمال migrationها (CI / production)
npm run db:status
docker compose run --rm migrate           # در استقرار Docker
```

قانون: migrationی که روی هر محیطی اعمال شده هرگز ویرایش نمی‌شود؛ تغییر بعدی همیشه migration جدید است.

## حذف و نگهداری داده‌ها

- سازمان‌ها بایگانی می‌شوند (`status=ARCHIVED`, `archived_at`) و حذف سخت در جریان عادی نیست.
- نشست‌های منقضی/لغوشده پس از ۳۰ روز، توکن‌های ایمیل ۷ روز پس از انقضا و دعوت‌نامه‌های پذیرفته‌نشده ۳۰ روز پس از انقضا توسط scheduler حذف می‌شوند.
- `audit_logs` قابل UPDATE نیست؛ پاک‌سازی بر اساس سیاست نگهداری فقط با DELETE توسط اپراتور انجام می‌شود.

## تراکنش‌ها و هم‌زمانی

- ثبت‌نام (کاربر + سازمان + عضویت + audit) در یک تراکنش.
- مصرف توکن‌ها با `UPDATE ... WHERE used_at IS NULL RETURNING` اتمیک است؛ دو درخواست هم‌زمان نمی‌توانند یک توکن را دو بار مصرف کنند.
- حذف عضو با سطح `SERIALIZABLE` تا بررسی «حداقل یک مالک» در رقابت هم‌زمان نقض نشود.

## Row-Level Security

در فاز B جداسازی در لایه برنامه انجام و با تست پوشش داده شده است. طرح RLS برای فاز F:
1. نقش دیتابیس جدا برای برنامه (بدون `BYPASSRLS`).
2. policy روی جدول‌های tenant: `organization_id = current_setting('app.organization_id')::uuid`.
3. در هر تراکنش: `SELECT set_config('app.organization_id', $1, true)` (معادل `SET LOCAL`) قبل از کوئری‌ها، از طریق Prisma `$transaction`.
