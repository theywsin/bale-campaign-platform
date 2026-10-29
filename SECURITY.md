# امنیت

## گزارش آسیب‌پذیری

آسیب‌پذیری‌ها را به‌صورت خصوصی به مالک مخزن گزارش دهید و آن را در issue عمومی منتشر نکنید.

## کنترل‌های پیاده‌سازی‌شده (فاز A و B)

| موضوع | پیاده‌سازی | تست |
|---|---|---|
| هش رمز | Argon2id (m=19 MiB، t=3، p=1)، rehash خودکار در ورود | `auth.int.ts` |
| نشست | توکن تصادفی ۲۵۶ بیتی در کوکی httpOnly/SameSite=Lax/Secure؛ فقط SHA-256 در دیتابیس؛ انقضای مطلق (۷ روز) و بیکاری (۴۸ ساعت)؛ ابطال با تغییر رمز | `auth.int.ts` |
| CSRF | double-submit (`bcp_csrf` + `X-CSRF-Token`، مقایسه زمان‌ثابت) + بررسی Origin/Referer | `security.int.ts` |
| CORS | فقط `APP_URL` و `CORS_ORIGINS` | — |
| Rate limit | سراسری per-IP در Redis؛ سخت‌تر برای ثبت‌نام/بازیابی؛ قفل ورود per-email و per-IP؛ لایه دوم در Nginx | `security.int.ts` |
| دسترسی | RBAC + بررسی عضویت در هر درخواست سازمانی؛ غیرعضو ۴۰۴ می‌گیرد؛ جلوگیری از ارتقای نقش؛ حفظ حداقل یک مالک | `tenancy.int.ts`, `admin.int.ts` |
| اعتبارسنجی ورودی | Zod در سرور (فیلدهای ناشناخته حذف می‌شوند)؛ ParseUUIDPipe | `security.int.ts` |
| SQL Injection | فقط کوئری‌های پارامتری Prisma | `security.int.ts` |
| XSS | React escape؛ رد `<` و `>` در نام‌ها؛ CSP؛ HTML ایمیل escape می‌شود | `security.int.ts` |
| حجم درخواست | ۱ مگابایت در API، ۱۲ مگابایت در Nginx | `security.int.ts` |
| افشای اسرار | select صریح ستون‌ها؛ هیچ پاسخ API شامل hash/token نیست؛ خطای ۵۰۰ عمومی | `security.int.ts` |
| لاگ | redact برای cookie، authorization، X-CSRF-Token، set-cookie، password، token؛ query string لاگ نمی‌شود | `log-redaction.spec.ts` |
| شمارش حساب | پاسخ یکسان برای ورود ناموفق و «فراموشی رمز»؛ زمان‌سنجی مشابه با hash ساختگی | `auth.int.ts` |
| ممیزی | رویدادهای امنیتی، سازمانی و مدیریتی؛ جدول فقط افزودنی (trigger) | `auth.int.ts`, `admin.int.ts` |
| هدرها | helmet در API؛ CSP، X-Frame-Options، nosniff، Referrer-Policy در وب؛ HSTS در Nginx (HTTPS) | — |
| کانتینرها | کاربر non-root، `read_only`، `cap_drop: ALL`، `no-new-privileges`، محدودیت منابع | — |
| شبکه | PostgreSQL و Redis بدون پورت منتشرشده و در شبکه internal؛ Redis با رمز | `docker compose ps` |
| اسرار | فقط از env؛ `.env` در `.gitignore`؛ اعتبارسنجی env مقادیر را در خطا چاپ نمی‌کند | `env.spec.ts` |
| CSV Injection (فاز C) | در خروجی، سلول‌هایی که با `= + - @ TAB CR` شروع شوند با `'` خنثی می‌شوند (به‌جز عدد خالص) | `csv.spec.ts`, `contacts.int.ts` |
| آپلود CSV (فاز C) | حافظه‌ای، حداکثر ۲ مگابایت، ۱ فایل، پسوند `.csv`، حداکثر ۱۰٬۰۰۰ سطر؛ فایل ذخیره نمی‌شود | `contacts.int.ts` |
| جداسازی داده‌های فاز C | همه کوئری‌ها با `organization_id`؛ ارجاع به حساب/فهرست/مخاطب سازمان دیگر رد می‌شود | `contacts.int.ts`, `campaigns.int.ts` |
| حساب آزمایشی | `MOCK` فقط با `MESSAGING_MOCK_ENABLED=true` (پیش‌فرض false و در compose خاموش)؛ در UI با برچسب «آزمایشی» | `campaigns.int.ts` |
| ارسال تکراری | UNKNOWN هرگز خودکار تکرار نمی‌شود؛ عدم ارسال/انصراف پیش از هر ارسال دوباره بررسی می‌شود | `campaigns.int.ts` |
| توکن بازوی بله (فاز D) | AES-256-GCM با کلید env (`CREDENTIALS_ENCRYPTION_KEY`) و AAD شناسه حساب؛ هرگز در پاسخ، audit یا لاگ؛ پیام خطاها شامل URL/توکن نیست | `bale.test.ts`, `bale.int.ts` |
| پرداخت (فاز E) | فقط Interface + درگاه آزمایشی (`PAYMENTS_MOCK_ENABLED`, پیش‌فرض false)، با برچسب آشکار «آزمایشی» در UI؛ وب‌هوک با HMAC-SHA256 و مقایسه زمان‌ثابت؛ idempotent؛ مبلغ callback با مبلغ پرداخت مقایسه می‌شود؛ وضعیت نهایی تغییرناپذیر | `billing.int.ts`, `payment-gateway.spec.ts` |
| داده حساس پرداخت (فاز E) | SUPPORT به سفارش، پرداخت و درآمد دسترسی ندارد؛ مرجع درگاه بدون `admin:payments:sensitive` ماسک می‌شود؛ محتوای خام وب‌هوک فقط با همان مجوز | `billing.int.ts` |
| لایسنس (فاز E) | ۸۰ بیت تصادفی (`crypto.randomInt`)؛ فقط SHA-256 ذخیره و فقط یک بار نمایش؛ مصرف اتمی (`UPDATE ... WHERE status='AVAILABLE'`)؛ پیام یکسان برای همه کلیدهای نامعتبر؛ rate limit سخت | `billing.int.ts` |
| پوشش مسیرها (فاز F) | فهرست همه مسیرهای Express از خود برنامه خوانده می‌شود؛ هر مسیر خارج از فهرست عمومی باید به ناشناس ۴۰۱ و هر مسیر ادمین به مشتری ۴۰۳ بدهد | `route-inventory.int.ts` |
| SSRF (فاز D) | نشانی API بله فقط از env؛ https اجباری در production؛ redirect ممنوع؛ قالب توکن محدود تا مسیر URL را تغییر ندهد | `bale.test.ts` |

## ورود دومرحله‌ای و CSP (فاز G)

- TOTP (RFC 6238، ±۱ گام) با راز رمزنگاری‌شده با `CREDENTIALS_ENCRYPTION_KEY`؛ جلوگیری از استفاده دوباره هر کد (Redis)؛ ۱۰ کد بازیابی یک‌بارمصرف که فقط هش آن‌ها ذخیره می‌شود.
- ورود دومرحله‌ای: پس از رمز درست، توکن چالش ۵ دقیقه‌ای با حداکثر ۵ تلاش؛ نشست فقط پس از کد درست ساخته می‌شود. فعال‌سازی، سایر نشست‌ها را می‌بندد؛ غیرفعال‌سازی رمز و کد می‌خواهد.
- `ADMIN_MFA_REQUIRED=true` (پیش‌فرض): مدیران بدون ۲FA پاسخ `MFA_REQUIRED` از همه مسیرهای `/admin` می‌گیرند.
- CSP وب در هر درخواست با nonce تازه (`script-src 'self' 'nonce-…' 'strict-dynamic'`) در `middleware.ts`؛ همه صفحه‌ها پویا رندر می‌شوند. `style-src` هنوز `'unsafe-inline'` دارد.
- کارکنان SUPPORT تیکت‌ها را می‌بینند ولی به تنظیمات، توقف کمپین و راز اتصال‌ها دسترسی ندارند.

## نکات طراحی

- **ارسال ایمیل:** پیوندهای حاوی توکن هرگز لاگ نمی‌شوند؛ اگر SMTP تنظیم نشده باشد ایمیل ارسال نمی‌شود (نه اینکه در لاگ چاپ شود).
- **تأیید ایمیل با کلیک دکمه:** صفحه تأیید توکن را خودکار مصرف نمی‌کند تا اسکنرهای لینک ایمیل آن را باطل نکنند.
- **پنل مدیریت:** کنترل نهایی در API است؛ UI فقط آنچه مجاز است نمایش می‌دهد.
- **SSRF:** هنوز قابلیتی که URL از کاربر بگیرد وجود ندارد. وب‌هوک‌ها و آپلود از URL در فازهای بعد باید allow-list و منع آدرس‌های داخلی داشته باشند.
- **رمزنگاری اعتبارنامه‌های اتصال:** توکن بازوی بله با AES-256-GCM و کلید خارج از دیتابیس (`CREDENTIALS_ENCRYPTION_KEY`) رمز می‌شود. کلید را جدا از بکاپ دیتابیس نگه دارید؛ چرخش کلید هنوز ابزار ندارد (فعلاً: کلید جدید + ثبت دوباره توکن‌ها).

## بررسی وابستگی‌ها

در CI (`.github/workflows/ci.yml`) روی هر PR: `npm audit --omit=dev --audit-level=moderate`، اسکن Trivy ایمیج‌های api و web (شکست روی HIGH/CRITICAL قابل‌رفع) و بررسی نبود فایل `.env` در ایمیج‌ها.


```bash
npm audit --omit=dev
```

نسخه‌ها در `package.json` بدون `^` ثابت هستند و `package-lock.json` در مخزن است.

## کارهای باقی‌مانده پیش از انتشار عمومی

- اتصال به درگاه بانکی واقعی: پیاده‌سازی `PaymentGateway`، تأیید نتیجه با API «verify» خود درگاه پیش از SUCCEEDED (callback امضاشده به‌تنهایی کافی نیست)، و تطبیق روزانه با گزارش درگاه برای پرداخت‌هایی که پس از لغو خودکار سفارش (۲۴ ساعت) موفق شده‌اند

- RLS در PostgreSQL به‌عنوان لایه دوم جداسازی

- تست نفوذ مستقل
