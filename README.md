# بله‌کمپین — Bale Campaign Platform

سامانه SaaS چندمشتریه، فارسی و RTL برای مدیریت مخاطبان و کمپین‌های پیام‌رسان بله.

> **وضعیت:** فاز A (زیرساخت)، فاز B (هسته SaaS) و فاز C (مخاطبان، CSV، فهرست عدم ارسال، کمپین و صف ارسال) پیاده‌سازی و تست شده‌اند.
> فاز D (اتصال بازوی بله با `getMe` و `sendMessage`) پیاده‌سازی شده، اما فقط با سرور ساختگی محلی تست شده است؛ هیچ پیام واقعی به بله ارسال نشده
> ([BALE_INTEGRATION.md](BALE_INTEGRATION.md)). پرداخت و لایسنس (فاز E) هنوز ساخته نشده‌اند.
> جزئیات در [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## اجزا

| مسیر | توضیح |
|---|---|
| `apps/web` | Next.js 15 (App Router)، صفحات عمومی، پنل مشتری، پنل مدیریت |
| `apps/api` | NestJS 11، REST API نسخه `v1`، Swagger در `/api/docs` |
| `apps/worker` | پردازشگر صف BullMQ: ارسال ایمیل و ارسال کمپین |
| `apps/scheduler` | انتقال Outbox به صف، شروع کمپین‌های زمان‌بندی‌شده، بازیابی ارسال‌های گیرکرده، پاک‌سازی نشست‌ها |
| `packages/shared` | نقش‌ها، مجوزها، اسکیماهای Zod، نرمال‌سازی شماره، ماشین وضعیت کمپین و سیاست Retry |
| `packages/messaging` | قرارداد `MessagingProvider`، نرمال‌سازی خطا و `MockMessagingProvider` (فقط تست) |
| `packages/engine` | موتور ارسال کمپین، Outbox relay، زمان‌بندی و بازیابی (مشترک worker، scheduler و تست‌ها) |
| `packages/database` | Prisma Client مشترک |
| `packages/config` | اعتبارسنجی متغیرهای محیطی و ابزار health/shutdown |
| `prisma/` | `schema.prisma` و migrationها |
| `infra/` | Dockerfile، پیکربندی Nginx، اسکریپت‌های بکاپ و بازیابی |
| `tests/e2e` | تست‌های E2E با Playwright |

مستندات: [ARCHITECTURE.md](ARCHITECTURE.md) · [DATABASE.md](DATABASE.md) · [API.md](API.md) · [SECURITY.md](SECURITY.md) · [DEPLOYMENT.md](DEPLOYMENT.md) · [BACKUP_RESTORE.md](BACKUP_RESTORE.md) · [BALE_INTEGRATION.md](BALE_INTEGRATION.md)

## پیش‌نیازها

- Node.js 22 LTS (`>=22.12`) و npm 10
- Docker 24+ و Docker Compose v2

## راه‌اندازی محلی (توسعه)

```bash
cp .env.example .env                           # مقادیر پیش‌فرض برای توسعه مناسب‌اند
npm ci
docker compose -f docker-compose.dev.yml up -d # فقط PostgreSQL و Redis روی 127.0.0.1
npm run db:migrate:deploy                      # اجرای migrationها
npm run build                                  # ساخت پکیج‌ها و اپ‌ها

# در سه ترمینال جدا:
npm run dev:api                                # http://localhost:4000/api/v1/health
npm run dev:web                                # http://localhost:3000
npm run dev -w @bcp/worker                     # لازم برای ارسال کمپین
npm run dev -w @bcp/scheduler                  # لازم برای ارسال کمپین (Outbox و زمان‌بندی)
```

در `.env.example` مقدار `MESSAGING_MOCK_ENABLED=true` است تا روند کمپین با حساب آزمایشی قابل امتحان باشد.
در حساب آزمایشی نتیجه با رقم‌های پایانی شناسه چت تعیین می‌شود: `…991` رد، `…992` خطای موقت (موفق در تلاش دوم)،
`…993` نامشخص، `…994` محدودیت نرخ، بقیه «پذیرفته‌شده».

Swagger در حالت توسعه: http://localhost:4000/api/docs (با `SWAGGER_ENABLED=true`).

### ساخت مدیر سامانه

هیچ حساب یا رمز پیش‌فرضی وجود ندارد. مدیر ارشد را با دستور زیر بسازید:

```bash
ADMIN_EMAIL=ops@example.com ADMIN_FULL_NAME="مدیر سامانه" ADMIN_PASSWORD='یک-رمز-قوی-123' \
  npm run admin:create
```

اگر کاربر از قبل وجود داشته باشد، فقط نقش `ADMIN_ROLE` (پیش‌فرض `SUPER_ADMIN`) به او داده می‌شود.

## تست‌ها

```bash
npm test                    # unit: packages/shared و packages/messaging (node:test) و apps/api (jest)
npm run test:integration    # integration و امنیتی API — به PostgreSQL و Redis محلی نیاز دارد
npm run test:e2e            # E2E — API، worker، scheduler و وب (3000) باید در حال اجرا باشند
```

- تست‌های integration از دیتابیس جداگانه `bcp_test` و Redis DB شماره 15 و 14 استفاده می‌کنند (قابل تغییر با `TEST_DATABASE_URL` و `TEST_REDIS_URL`).
- برای E2E، مرورگر Playwright باید نصب باشد: `npx playwright install chromium`. آدرس با `E2E_BASE_URL` قابل تغییر است.
- E2E در هر اجرا حدود ۱۰ حساب ثبت‌نام می‌کند؛ برای محیط تست `AUTH_RATE_LIMIT_PER_MINUTE` را بالاتر (مثلاً ۶۰) بگذارید وگرنه محدودیت ثبت‌نام (۱۰ در دقیقه برای هر IP) عمداً جلوی آن را می‌گیرد.
- تست بازوی بله با سرور ساختگی `tests/fake-bale/server.mjs` اجرا می‌شود (`BALE_API_BASE_URL=http://127.0.0.1:4300` و `E2E_BALE_TOKEN=123456:local_test_token`).
- تست E2E فروش (`billing.e2e.test.mjs`) به `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` و `PAYMENTS_MOCK_ENABLED=true` نیاز دارد و پلن‌های ساخته‌شده را در پایان غیرفعال می‌کند.
- تست بار: `LOAD_BASE_URL=http://localhost:4000 node tests/load/load.mjs` (فقط روی محیط آزمایشی؛ جزئیات و نتایج در [RELEASE.md](RELEASE.md)).
- E2E روی HTTPS با گواهی خودامضا: `E2E_INSECURE_TLS=1 E2E_BASE_URL=https://localhost:8443 npm run test:e2e`.
- هیچ تستی پیام واقعی ارسال نمی‌کند و ایمیل‌ها در تست فقط در صف قرار می‌گیرند.

## اجرای کامل با Docker Compose

```bash
cp .env.example .env
# در .env این موارد را تنظیم کنید: POSTGRES_PASSWORD، REDIS_PASSWORD، APP_URL، COOKIE_SECURE=true
docker compose config --quiet          # بررسی پیکربندی
docker compose build
docker compose up -d                   # migrate به‌صورت یک‌باره قبل از api/worker/scheduler اجرا می‌شود
docker compose ps                      # همه سرویس‌ها باید healthy باشند
curl http://127.0.0.1:8080/api/v1/health/ready
```

پنل در `http://127.0.0.1:8080` در دسترس است. برای استقرار عمومی با HTTPS به [DEPLOYMENT.md](DEPLOYMENT.md) مراجعه کنید.

| کار | دستور |
|---|---|
| مشاهده لاگ | `docker compose logs -f api worker scheduler` |
| اجرای migration | `docker compose run --rm migrate` |
| ساخت مدیر | `docker compose exec -e ADMIN_EMAIL=... -e ADMIN_FULL_NAME=... -e ADMIN_PASSWORD=... api node dist/cli/create-admin.js` |
| توقف (بدون حذف داده) | `docker compose stop` یا `docker compose down` |
| به‌روزرسانی | `git pull && docker compose build && docker compose up -d` |
| پشتیبان‌گیری | `BACKUP_PASSPHRASE_FILE=/root/.bcp-backup-pass ./infra/scripts/backup.sh /var/backups/bcp` |
| بازیابی | `BACKUP_PASSPHRASE_FILE=... ./infra/scripts/restore.sh <file>` — جزئیات در [BACKUP_RESTORE.md](BACKUP_RESTORE.md) |

> ⚠️ هرگز `docker compose down -v` را روی محیط واقعی اجرا نکنید؛ این دستور volume دیتابیس را حذف می‌کند.

## متغیرهای محیطی

همه متغیرها با توضیح در [.env.example](.env.example) آمده‌اند. موارد ضروری برای استقرار:

| متغیر | توضیح |
|---|---|
| `POSTGRES_PASSWORD` | رمز دیتابیس (تصادفی و طولانی) |
| `REDIS_PASSWORD` | رمز Redis |
| `APP_URL` | نشانی عمومی پنل، مثل `https://panel.example.com` |
| `COOKIE_SECURE` | در production باید `true` باشد (API در غیر این صورت اجرا نمی‌شود) |
| `SMTP_URL` / `MAIL_FROM` | اختیاری؛ بدون آن ایمیل بازیابی رمز و دعوت‌نامه ارسال نمی‌شود |
| `CREDENTIALS_ENCRYPTION_KEY` | برای بازوی بله لازم است: `openssl rand -base64 32`؛ جدا از بکاپ دیتابیس نگه دارید |
| `MESSAGING_MOCK_ENABLED` | پیش‌فرض `false`؛ فقط برای محیط آزمایشی `true` شود (حساب Mock، بدون ارسال واقعی) |
| `PAYMENTS_MOCK_ENABLED` / `PAYMENT_WEBHOOK_SECRET` | درگاه پرداخت آزمایشی (هیچ پولی جابه‌جا نمی‌شود)؛ پیش‌فرض خاموش؛ با روشن‌کردن آن رمز وب‌هوک حداقل ۳۲ نویسه لازم است (`openssl rand -hex 32`). بدون درگاه، فقط پلن رایگان، کلید لایسنس و اعطای دستی کار می‌کند |

## آنچه هنوز برای انتشار عمومی آماده نیست

فهرست کامل و گام‌های روز انتشار: [RELEASE.md](RELEASE.md).


- تأیید اتصال بله با بازوی واقعی — `tapi.bale.ai` از محیط توسعه در دسترس نبود و هیچ ارسال واقعی انجام نشده است
- اتصال به درگاه پرداخت بانکی واقعی — فقط درگاه آزمایشی پیاده‌سازی شده است؛ فروش واقعی فعلاً با کلید لایسنس یا اعطای دستی اشتراک ممکن است
- تیکت پشتیبانی، تنظیمات سامانه در پنل ادمین
- تست بار، RLS در PostgreSQL، بازبینی حقوقی متن شرایط و حریم خصوصی (فاز F)
