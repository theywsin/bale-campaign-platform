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

## جدول‌ها (فاز C)

| جدول | توضیح | قیود و ایندکس‌های مهم |
|---|---|---|
| `contacts` | مخاطب؛ `phone` به‌صورت E.164، `bale_chat_id` برای ارسال با بازو، `consent` (UNKNOWN/OPTED_IN/OPTED_OUT) | `(organization_id, phone)` و `(organization_id, bale_chat_id)` unique؛ `(organization_id, status, created_at desc)` |
| `contact_lists`, `contact_list_members` | فهرست‌ها و عضویت چندبه‌چند | `(organization_id, name)` unique؛ کلید `(list_id, contact_id)` |
| `suppression_entries` | فهرست عدم ارسال (موبایل یا شناسه چت) | `(organization_id, kind, value)` unique |
| `contact_imports` | خلاصه هر ورود CSV؛ حداکثر ۵۰۰ خطا (شماره سطر + علت، بدون داده کامل سطر) | `(organization_id, created_at desc)` |
| `messaging_accounts` | حساب ارسال (`MOCK` فقط تست، `BALE_BOT` در فاز D)؛ `credentials_encrypted` هرگز از API برنمی‌گردد | `organization_id` |
| `campaigns` | کمپین؛ `list_id` خالی یعنی همه مخاطبان فعال | `(organization_id, created_at desc)`؛ `(status, scheduled_at)` |
| `campaign_recipients` | یک ردیف برای هر گیرنده (snapshot شناسه چت در لحظه شروع) | `(campaign_id, contact_id)` unique؛ `(campaign_id, status, next_attempt_at)`؛ `(status, locked_at)` |
| `message_attempts` | هر فراخوانی ارائه‌دهنده؛ **پیش از** فراخوانی ساخته می‌شود | `(recipient_id, attempt_no)` unique |
| `outbox_events` | Transactional Outbox | `(status, available_at)` |

## جدول‌ها (فاز E)

| جدول | توضیح | قیود و ایندکس‌های مهم |
|---|---|---|
| `plans` | پلن؛ `price_rials` (BigInt)، `period_days`، سقف‌ها (null = نامحدود)، `is_public`، `is_active`، `is_default` (پلن پایه برای سازمان بدون اشتراک) | `code` unique؛ حداکثر یک پلن پایه (ایندکس جزئی)؛ CHECK قیمت ≥ ۰ و مدت > ۰ |
| `subscriptions` | اشتراک سازمان؛ `source` = PAYMENT / LICENSE / ADMIN؛ فقط تا `ends_at` معتبر است | حداکثر یک `ACTIVE` برای هر سازمان (ایندکس جزئی)؛ `(status, ends_at)` |
| `orders` | سفارش؛ مبلغ و مدت هنگام ایجاد snapshot می‌شود | `(organization_id, created_at desc)`؛ CHECK مبلغ ≥ ۰ |
| `payments` | پرداخت؛ `provider_ref` مرجع درگاه | `(provider, provider_ref)` unique |
| `payment_status_history` | هر تغییر وضعیت پرداخت (فقط افزودنی) | `(payment_id, created_at)` |
| `webhook_events` | callbackهای درگاه | `(provider, event_id)` unique ⇒ پردازش یک‌باره |
| `licenses` | کلید لایسنس؛ فقط SHA-256 کلید و ۸ نویسه اول آن ذخیره می‌شود | `key_hash` unique |

مدل‌های فاز F (مثل SupportTicket) با migrationهای جدید اضافه می‌شوند.

## جدول‌ها (فاز G)

| جدول | توضیح |
|---|---|
| `support_tickets` | تیکت هر سازمان؛ وضعیت OPEN/ANSWERED/CLOSED، اولویت، دسته، `last_message_at` |
| `support_ticket_messages` | پیام‌ها با `from_staff`؛ حداکثر ۵۰۰۰ کاراکتر |
| `user_recovery_codes` | هش کدهای بازیابی ۲FA و زمان مصرف |
| `users.totp_secret_encrypted`، `users.totp_enabled_at` | راز TOTP رمزنگاری‌شده با کلید بیرون از پایگاه داده |

## RLS (فاز I)

migration `20261030090000_row_level_security` نقش `bcp_app` (NOLOGIN، بدون BYPASSRLS) را می‌سازد، به کاربر اتصال اجازه `SET ROLE` به آن را می‌دهد و روی جدول‌های سازمانی سیاست `tenant_isolation` می‌گذارد. وقتی `app.org_id` تنظیم نشده باشد (migration، worker، scheduler، مدیریت سامانه) سیاست مانعی ندارد.

## Migrationها

| Migration | محتوا |
|---|---|
| `20261025114633_init` | `system_settings` |
| `20261025120430_identity_and_organizations` | کاربران، نشست‌ها، سازمان‌ها، دعوت‌نامه، audit + ایندکس partial و trigger دستی |
| `20261025121000_audit_log_allow_org_set_null` | اجازه به `ON DELETE SET NULL` روی audit در حذف سخت سازمان |
| `20261025161242_messaging_account_identity` | `external_name` (نام کاربری بازو) و `last_checked_at` در `messaging_accounts` |
| `20261025130617_contacts_and_campaigns` | مخاطبان، فهرست‌ها، عدم ارسال، ورود CSV، حساب پیام‌رسان، کمپین، گیرنده، تلاش ارسال، outbox |
| `20261028093551_billing_and_licenses` | پلن، اشتراک، سفارش، پرداخت و تاریخچه، وب‌هوک، لایسنس؛ ایندکس‌های جزئی و CHECKها |

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

- **وب‌هوک پرداخت:** درج `webhook_events` و اثر آن (پرداخت، تاریخچه، سفارش، اشتراک) در یک تراکنش است؛ تکرار همان رویداد با unique رد می‌شود و رویدادی که پردازشش شکست بخورد چیزی باقی نمی‌گذارد تا تلاش بعدی درگاه پردازش شود. ردیف پرداخت با `FOR UPDATE` قفل می‌شود و وضعیت نهایی (SUCCEEDED/FAILED/CANCELED) دیگر تغییر نمی‌کند.
- **اعطای اشتراک:** ردیف سازمان با `FOR UPDATE` قفل می‌شود؛ تمدید همان پلن تاریخ پایان را جلو می‌برد، پلن دیگر اشتراک قبلی را می‌بندد (بدون محاسبه مبلغ باقی‌مانده).

- ثبت‌نام (کاربر + سازمان + عضویت + audit) در یک تراکنش.
- مصرف توکن‌ها با `UPDATE ... WHERE used_at IS NULL RETURNING` اتمیک است؛ دو درخواست هم‌زمان نمی‌توانند یک توکن را دو بار مصرف کنند.
- حذف عضو با سطح `SERIALIZABLE` تا بررسی «حداقل یک مالک» در رقابت هم‌زمان نقض نشود.
- شروع کمپین: تغییر وضعیت (با شرط `status='DRAFT'`)، ثبت گیرندگان با یک `INSERT ... SELECT` و ثبت رویداد outbox در **یک تراکنش**.
- برداشتن گیرندگان برای ارسال: `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING`؛ دو worker هرگز یک گیرنده را هم‌زمان برنمی‌دارند.
- انتقال وضعیت کمپین همیشه `updateMany` با شرط وضعیت‌های مجاز (از ماشین وضعیت `@bcp/shared`) است؛ رقابت دو درخواست یکی را با ۴۰۹ رد می‌کند.
- حذف مخاطب: گیرندگان در انتظار او `SUPPRESSED` می‌شوند و ردیف گزارش با `contact_id = NULL` باقی می‌ماند.

## Row-Level Security

در فاز B جداسازی در لایه برنامه انجام و با تست پوشش داده شده است. طرح RLS برای فاز F:
1. نقش دیتابیس جدا برای برنامه (بدون `BYPASSRLS`).
2. policy روی جدول‌های tenant: `organization_id = current_setting('app.organization_id')::uuid`.
3. در هر تراکنش: `SELECT set_config('app.organization_id', $1, true)` (معادل `SET LOCAL`) قبل از کوئری‌ها، از طریق Prisma `$transaction`.
