# API

- پایه: `/api/v1` — نسخه‌بندی در مسیر.
- قالب: JSON. محدودیت حجم بدنه: ۱ مگابایت.
- مستندات OpenAPI زنده: `/api/docs` و `/api/docs/openapi.json` (وقتی `SWAGGER_ENABLED=true`).

## احراز هویت

- نشست با کوکی `bcp_session` (httpOnly، `SameSite=Lax`، `Secure` در production).
- برای هر درخواست غیر GET:
  1. ابتدا `GET /api/v1/auth/csrf` → کوکی `bcp_csrf` و `{ csrfToken }`
  2. ارسال همان مقدار در هدر `X-CSRF-Token`
  3. اگر هدر `Origin` ارسال شود، باید در فهرست مجاز (`APP_URL`, `CORS_ORIGINS`) باشد.

## قالب خطا

```json
{ "statusCode": 400, "code": "VALIDATION_ERROR", "message": "ایمیل معتبر نیست.", "fieldErrors": { "email": ["ایمیل معتبر نیست."] }, "requestId": "..." }
```

کدها: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `CSRF_REJECTED`, `INVALID_CREDENTIALS`, `ACCOUNT_SUSPENDED`, `LOGIN_LOCKED`, `TOKEN_INVALID`, `PAYLOAD_TOO_LARGE`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`.
خطاهای غیرمنتظره فقط پیام عمومی دارند؛ جزئیات فقط در لاگ سرور (با `requestId`).

## Endpointها

| متد | مسیر | دسترسی | توضیح |
|---|---|---|---|
| GET | `/health` | عمومی | liveness |
| GET | `/health/ready` | عمومی | وضعیت دیتابیس و Redis (۵۰۳ اگر خراب) |
| GET | `/auth/csrf` | عمومی | صدور کوکی CSRF |
| GET | `/auth/capabilities` | عمومی | آیا ارسال ایمیل پیکربندی شده |
| POST | `/auth/register` | عمومی (rate limit سخت) | ساخت کاربر + فضای کاری، ورود |
| POST | `/auth/login` | عمومی (قفل پس از ۵ خطا) | ورود |
| POST | `/auth/logout` | نشست | خروج |
| GET | `/auth/me` | نشست | کاربر و فضاهای کاری |
| POST | `/auth/password/forgot` | عمومی | همیشه ۲۰۲ (بدون افشای وجود حساب) |
| POST | `/auth/password/reset` | عمومی | تعیین رمز با توکن؛ همه نشست‌ها بسته می‌شود |
| POST | `/auth/email/verify` | عمومی | تأیید ایمیل با توکن |
| POST | `/auth/email/resend` | نشست | ارسال دوباره پیوند تأیید |
| PATCH | `/users/me` | نشست | ویرایش نام |
| POST | `/users/me/password` | نشست | تغییر رمز؛ سایر نشست‌ها بسته می‌شوند |
| GET | `/users/me/sessions` | نشست | نشست‌های فعال |
| DELETE | `/users/me/sessions/:id` | نشست | بستن یک نشست خود |
| POST | `/users/me/sessions/revoke-others` | نشست | بستن سایر نشست‌ها |
| GET | `/organizations` | نشست | فضاهای کاری من |
| POST | `/organizations` | نشست | ساخت فضای کاری |
| POST | `/organizations/invitations/accept` | نشست | پذیرش دعوت (ایمیل باید یکی باشد) |
| GET | `/organizations/:orgId` | `org:read` | جزئیات و آمار |
| PATCH | `/organizations/:orgId` | `org:update` | تغییر نام |
| GET | `/organizations/:orgId/activity` | `audit:read` | فعالیت‌های اخیر |
| GET | `/organizations/:orgId/members` | `members:read` | اعضا |
| PATCH | `/organizations/:orgId/members/:memberId` | `members:update-role` | تغییر نقش |
| DELETE | `/organizations/:orgId/members/:memberId` | عضو (خروج) یا `members:remove` | حذف عضو |
| GET/POST | `/organizations/:orgId/invitations` | `members:invite` | فهرست / ایجاد دعوت |
| DELETE | `/organizations/:orgId/invitations/:id` | `members:invite` | لغو دعوت |
| GET | `/organizations/:orgId/contacts` | `contacts:read` | فهرست (`q`, `status`, `listId`, صفحه‌بندی) |
| POST | `/organizations/:orgId/contacts` | `contacts:write` | ایجاد؛ موبایل یا شناسه چت لازم است؛ تکراری ۴۰۹ |
| GET/PATCH/DELETE | `/organizations/:orgId/contacts/:id` | `contacts:read` / `contacts:write` | جزئیات / ویرایش / حذف دائمی |
| PUT | `/organizations/:orgId/contacts/:id/archived` | `contacts:write` | `{archived: boolean}` |
| POST | `/organizations/:orgId/contacts/import` | `contacts:write` | multipart (`file`, `listId?`)؛ حداکثر ۲ مگابایت و ۱۰٬۰۰۰ سطر؛ گزارش سطرهای نامعتبر |
| GET | `/organizations/:orgId/contacts/imports` | `contacts:read` | ۲۰ ورود اخیر |
| GET | `/organizations/:orgId/contacts/export` | `contacts:export` | CSV (UTF-8 با BOM)، با خنثی‌سازی فرمول |
| GET/POST | `/organizations/:orgId/lists` | `contacts:read` / `contacts:write` | فهرست‌ها |
| PATCH/DELETE | `/organizations/:orgId/lists/:id` | `contacts:write` | ویرایش / حذف (اگر در کمپین فعال نباشد) |
| POST | `/organizations/:orgId/lists/:id/members` و `/members/remove` | `contacts:write` | `{contactIds: uuid[≤500]}` |
| GET/POST | `/organizations/:orgId/suppressions` | `contacts:read` / `contacts:write` | فهرست عدم ارسال |
| DELETE | `/organizations/:orgId/suppressions/:id` | `contacts:write` | حذف |
| GET | `/organizations/:orgId/messaging-accounts` | `messaging-accounts:read` | `{mockEnabled, baleEnabled, items}`؛ اعتبارنامه هرگز برنمی‌گردد |
| POST | `/organizations/:orgId/messaging-accounts/mock` | `messaging-accounts:write` | حساب آزمایشی؛ فقط اگر `MESSAGING_MOCK_ENABLED=true` |
| POST | `/organizations/:orgId/messaging-accounts/bale-bot` | `messaging-accounts:write` | `{displayName, token, rateLimitPerMinute?}`؛ بررسی با getMe؛ توکن نامعتبر ۴۰۰، بله در دسترس نیست یا کلید تنظیم نشده ۵۰۳ |
| POST | `/organizations/:orgId/messaging-accounts/:id/check` | `messaging-accounts:write` | بررسی دوباره اتصال |
| PUT | `/organizations/:orgId/messaging-accounts/:id/token` | `messaging-accounts:write` | تعویض توکن (پس از بررسی) |
| PUT | `/organizations/:orgId/messaging-accounts/:id/status` | `messaging-accounts:write` | فعال / غیرفعال |
| DELETE | `/organizations/:orgId/messaging-accounts/:id` | `messaging-accounts:write` | اگر در کمپین فعال نباشد |
| GET/POST | `/organizations/:orgId/campaigns` | `campaigns:read` / `campaigns:write` | فهرست با شمارش وضعیت‌ها / ایجاد پیش‌نویس |
| GET/PATCH/DELETE | `/organizations/:orgId/campaigns/:id` | `campaigns:read` / `campaigns:write` | ویرایش و حذف فقط در `DRAFT` |
| POST | `/organizations/:orgId/campaigns/:id/start` | `campaigns:send` | `{scheduledAt?}`؛ ثبت گیرندگان + outbox |
| POST | `/organizations/:orgId/campaigns/:id/pause` \| `resume` \| `cancel` | `campaigns:send` | انتقال وضعیت؛ غیرمجاز ⇒ ۴۰۹ |
| GET | `/organizations/:orgId/campaigns/:id/recipients` | `campaigns:read` | گزارش گیرندگان (`status`, صفحه‌بندی) |
| GET | `/plans` | عمومی | پلن‌های فعال و عمومی (صفحه قیمت‌ها)؛ مبلغ‌ها رشته ریالی |
| GET | `/organizations/:orgId/billing` | `billing:read` | پلن و اشتراک فعلی، سقف‌ها، مصرف، پلن‌ها، ۲۰ سفارش اخیر |
| POST | `/organizations/:orgId/billing/checkout` | `billing:write` | `{planId}`؛ پلن رایگان فوراً فعال می‌شود؛ پلن پولی ⇒ سفارش + پرداخت و `redirectUrl`؛ بدون درگاه ۵۰۳ `PAYMENT_UNAVAILABLE` |
| POST | `/organizations/:orgId/billing/redeem-license` | `billing:write` (rate limit سخت) | `{key}`؛ کلید ناموجود، مصرف‌شده، باطل یا منقضی همه ۴۰۴ با یک پیام |
| GET | `/payments/mock/:paymentId` | نشست + `billing:write` در سازمان سفارش | اطلاعات صفحه درگاه آزمایشی؛ فقط با `PAYMENTS_MOCK_ENABLED=true` |
| POST | `/payments/mock/:paymentId/complete` | همان | `{outcome: SUCCEEDED\|FAILED\|CANCELED}`؛ callback امضاشده می‌سازد و از مسیر عادی وب‌هوک پردازش می‌کند |
| POST | `/payments/webhooks/mock` | عمومی، امضای HMAC در `X-Mock-Signature` (بدون CSRF) | idempotent با `(provider, eventId)`؛ امضای نادرست ۴۰۱؛ پاسخ `processed` / `duplicate` / `ignored` |
| GET | `/admin/stats` | `admin:dashboard` | آمار |
| GET | `/admin/billing/stats` | `admin:subscriptions:read` | اشتراک فعال، سفارش باز، کلید آماده؛ درآمد ۳۰ روز فقط با `admin:payments:read` |
| GET / POST | `/admin/plans` | `admin:subscriptions:read` / `admin:plans:write` | پلن‌ها با تعداد اشتراک فعال / ایجاد |
| PATCH | `/admin/plans/:id` | `admin:plans:write` | فقط فیلدهای ارسال‌شده تغییر می‌کنند؛ روی سفارش‌های قبلی اثر ندارد |
| GET | `/admin/subscriptions` | `admin:subscriptions:read` | `status`, `q` |
| POST | `/admin/organizations/:orgId/subscription` | `admin:subscriptions:write` | `{planId, periodDays}` اعطای دستی |
| POST | `/admin/subscriptions/:id/cancel` | `admin:subscriptions:write` | لغو فوری (بدون بازپرداخت خودکار) |
| GET | `/admin/orders` | `admin:payments:read` | سفارش‌ها با پرداخت‌ها و تاریخچه وضعیت؛ مرجع درگاه بدون `admin:payments:sensitive` ماسک می‌شود |
| GET | `/admin/webhook-events` | `admin:payments:sensitive` | محتوای خام callbackها |
| GET / POST | `/admin/licenses` | `admin:licenses:write` | فهرست (بدون hash) / ساخت تا ۱۰۰ کلید — کلیدها فقط در همین پاسخ |
| POST | `/admin/licenses/:id/revoke` | `admin:licenses:write` | فقط کلید استفاده‌نشده |
| GET | `/admin/users` | `admin:users:read` | جست‌وجو و صفحه‌بندی (`q`, `page`, `pageSize≤100`) |
| PATCH | `/admin/users/:id/status` | `admin:users:write` | تعلیق / فعال‌سازی |
| GET | `/admin/organizations` | `admin:orgs:read` | سازمان‌ها |
| GET | `/admin/audit-logs` | `admin:audit:read` | گزارش ممیزی (`category`, `q`) |

## محدودیت پلن

وقتی عملی از سقف پلن بگذرد، پاسخ `403` با `code: "PLAN_LIMIT_REACHED"` و پیامی است که سقف را نام می‌برد. نقاط بررسی: ایجاد و ورود CSV مخاطب (`maxContacts`)، ساخت حساب ارسال (`maxMessagingAccounts`)، دعوت عضو (`maxMembers`، اعضا + دعوت‌های باز)، شروع کمپین (`maxMonthlyMessages`؛ گیرندگان قابل ارسال در ماه میلادی جاری به وقت UTC، پس از ثبت گیرندگان و در همان تراکنش، پس عبور از سقف شروع را کامل برمی‌گرداند).
