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
packages/messaging قرارداد MessagingProvider، نرمال‌سازی خطا، Mock (فاز C)
packages/engine    موتور ارسال کمپین، Outbox relay، بازیابی (فاز C)
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

**پذیرش:** تست unit برای نرمال‌سازی شماره، ماشین وضعیت، سیاست Retry، نرمال‌سازی خطای ارائه‌دهنده و CSV؛ integration برای ایجاد مخاطب، ورود CSV، ایجاد/شروع/توقف/لغو کمپین، Retry، UNKNOWN، بازیابی و جداسازی سازمان‌ها؛ E2E برای ورود CSV، ارسال کمپین آزمایشی و گزارش.

تصمیم‌ها:
- ارسال فقط با شناسه چت بله؛ مخاطب بدون شناسه چت در گزارش با `NO_CHAT_ID` ناموفق ثبت می‌شود (بازو فقط به چت‌هایی که آن را شروع کرده‌اند پیام می‌دهد).
- مخاطب انصراف‌داده و فهرست عدم ارسال هم هنگام شروع کمپین و هم پیش از هر ارسال کنترل می‌شوند.
- لغو کمپین گیرندگان ارسال‌نشده را `FAILED` با کد `CAMPAIGN_CANCELLED` می‌بندد (هفت وضعیت گیرنده تغییر نکرده است).
- متغیرهای شخصی‌سازی متن پیام (مثل نام مخاطب) هنوز پشتیبانی نمی‌شوند.

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
| A | ✅ انجام‌شده و تست‌شده |
| B | ✅ انجام‌شده و تست‌شده |
| C | ✅ انجام‌شده و تست‌شده (ارسال فقط با حساب آزمایشی Mock) |
| D | ✅ پیاده‌سازی و تست با سرور ساختگی بله؛ ⚠️ با بازوی واقعی تأیید نشده (`tapi.bale.ai` در دسترس نبود) |
| E | شروع‌نشده |
| F | شروع‌نشده |

## نتایج تست فاز D (۲۰۲۶-۱۰-۲۵)

| دستور | نتیجه |
|---|---|
| `npm test` | ۲۳ (shared) + ۸ (messaging: BaleBotProvider با سرور HTTP ساختگی، نگاشت خطاها، رمزنگاری) + ۱۲ (API) — همه موفق |
| `npm run test:integration` | ۴۴ تست (۳ تست جدید `bale.int.ts`: بررسی توکن، رمزنگاری و عدم افشا، ارسال کمپین از طریق BaleBotProvider، ۵۰۳ هنگام در دسترس نبودن بله یا نبود کلید) — همه موفق |
| `npm run test:e2e` محلی با `tests/fake-bale/server.mjs` | ۱۲ تست — همه موفق (شامل اتصال بازو و ارسال کمپین از طریق آن) |
| Docker Compose | ۷ سرویس healthy، ۱۲ تست E2E روی nginx موفق (تست بازو در Docker اجرا نشد چون production نشانی https لازم دارد و بله در دسترس نیست)؛ افزودن بازو در Docker پاسخ ۵۰۳ «اتصال به API بله برقرار نشد» داد که با در دسترس نبودن `tapi.bale.ai` در این محیط سازگار است |
| `npm audit` | ۰ آسیب‌پذیری |

**تأییدنشده:** هیچ فراخوانی واقعی به `tapi.bale.ai` انجام نشده است. چک‌لیست در `BALE_INTEGRATION.md`.

## نتایج تست فاز C (۲۰۲۶-۱۰-۲۵)

| دستور | نتیجه |
|---|---|
| `npm run build` و `npm run typecheck` | موفق، بدون خطا |
| `npm test` | ۲۳ تست `packages/shared` + ۳ تست `packages/messaging` + ۱۲ تست unit در API — همه موفق |
| `npm run test:integration` | ۴۱ تست در ۷ فایل (۱۲ تست جدید در `contacts.int.ts` و `campaigns.int.ts`) — همه موفق |
| `npm run test:e2e` روی API + worker + scheduler + `next start` محلی | ۱۱ تست (۲ تست جدید فاز C؛ تست پنل ادمین بدون `E2E_ADMIN_*` اجرا نمی‌شود) — همه موفق؛ کمپین آزمایشی واقعاً از Outbox → scheduler → BullMQ → worker عبور کرد |
| `npm audit` | ۰ آسیب‌پذیری |
| Docker Compose (ایمیج‌های جدید، `MESSAGING_MOCK_ENABLED=true` فقط برای این تست) | migrate با کد ۰، ۷ سرویس healthy؛ `npm run test:e2e` روی nginx (پورت 8080) با مدیر ساخته‌شده از CLI: ۱۲ تست — همه موفق؛ لاگ worker «campaign completed» را نشان داد |

## نتایج تست فاز A و B (۲۰۲۶-۱۰-۲۵)

همه دستورها در محیط توسعه واقعاً اجرا شدند:

| دستور | نتیجه |
|---|---|
| `npm run build` | موفق (همه پکیج‌ها و اپ‌ها، Next.js production build) |
| `npm run typecheck` | بدون خطا (TypeScript strict) |
| `npm test` | ۱۰ تست unit در `packages/shared` + ۶ تست unit در API — همه موفق |
| `npm run test:integration` | ۲۹ تست در ۵ فایل (احراز هویت، جداسازی سازمان‌ها، پنل ادمین، امنیت، health) — همه موفق |
| `npm run test:e2e` روی `next start` + API محلی | ۹ تست — همه موفق |
| `npm run test:e2e` روی Docker Compose (nginx، پورت 8080) با مدیر ساخته‌شده از CLI | ۱۰ تست — همه موفق |
| `docker compose config --quiet` | موفق |
| `docker compose up -d` | ۷ سرویس healthy (postgres, redis, api, worker, scheduler, web, nginx) و migrate با کد ۰ |
| `GET /api/v1/health/ready` | ۲۰۰، دیتابیس و Redis «up» |
| `infra/scripts/backup.sh` + `restore.sh` | بکاپ رمزگذاری‌شده (GPG AES256) ساخته و در دیتابیس جدید بازیابی شد؛ تعداد ردیف‌های users/organizations/audit_logs/_prisma_migrations با دیتابیس اصلی یکسان بود |
| `npm audit` | ۰ آسیب‌پذیری (پس از override نسخه‌های وصله‌شده postcss، multer و js-yaml) |

### پوشش تست‌ها نسبت به خواسته‌ها

| خواسته | فاز | وضعیت |
|---|---|---|
| ثبت‌نام و ورود، دسترسی سازمان | B | ✅ integration + E2E |
| جلوگیری از دسترسی به سازمان دیگر، پنل ادمین، Rate Limit، ورودی مخرب، افشای اسرار در API و لاگ | B | ✅ integration/unit |
| E2E ثبت‌نام، ورود، ایجاد فضای کاری | B | ✅ |
| انتقال وضعیت کمپین، سیاست Retry، نرمال‌سازی خطای ارائه‌دهنده | C | ✅ unit (`campaign.test.ts`, `provider.test.ts`) |
| ایجاد مخاطب/کمپین، توقف کمپین، جداسازی سازمان‌ها در مخاطب و کمپین | C | ✅ integration |
| E2E ورود مخاطب، کمپین آزمایشی، گزارش | C | ✅ |
| اعتبارسنجی پلن/اشتراک/لایسنس، وب‌هوک تکراری، اشتراک با پرداخت تأییدنشده، E2E پلن و اشتراک | E | ⏳ |

### کارهای باقی‌مانده

- فاز D تا F طبق بخش‌های بالا.
- RLS، احراز هویت دومرحله‌ای برای مدیران، CSP مبتنی بر nonce (جزئیات در `SECURITY.md`).
- اتصال واقعی بله در محیطی با دسترسی به `tapi.bale.ai` تأیید شود.
