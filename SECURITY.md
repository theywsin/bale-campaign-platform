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

## نکات طراحی

- **ارسال ایمیل:** پیوندهای حاوی توکن هرگز لاگ نمی‌شوند؛ اگر SMTP تنظیم نشده باشد ایمیل ارسال نمی‌شود (نه اینکه در لاگ چاپ شود).
- **تأیید ایمیل با کلیک دکمه:** صفحه تأیید توکن را خودکار مصرف نمی‌کند تا اسکنرهای لینک ایمیل آن را باطل نکنند.
- **پنل مدیریت:** کنترل نهایی در API است؛ UI فقط آنچه مجاز است نمایش می‌دهد.
- **SSRF:** هنوز قابلیتی که URL از کاربر بگیرد وجود ندارد. وب‌هوک‌ها و آپلود از URL در فازهای بعد باید allow-list و منع آدرس‌های داخلی داشته باشند.
- **رمزنگاری اعتبارنامه‌های اتصال (فاز D):** توکن بازوی بله با AES-256-GCM و کلید خارج از دیتابیس (`CREDENTIALS_ENCRYPTION_KEY`) رمز می‌شود.

## بررسی وابستگی‌ها

```bash
npm audit --omit=dev
```

نسخه‌ها در `package.json` بدون `^` ثابت هستند و `package-lock.json` در مخزن است.

## کارهای باقی‌مانده پیش از انتشار عمومی

- RLS در PostgreSQL به‌عنوان لایه دوم جداسازی
- احراز هویت دومرحله‌ای (TOTP) برای نقش‌های مدیریتی
- CSP مبتنی بر nonce به‌جای `'unsafe-inline'` برای اسکریپت‌ها
- اسکن خودکار وابستگی و کانتینر در CI
- تست نفوذ مستقل
