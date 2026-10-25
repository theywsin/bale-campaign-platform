# استقرار

## پیش‌نیاز سرور

- لینوکس با Docker Engine 24+ و Docker Compose v2، حداقل ۲ vCPU و ۴ گیگابایت RAM
- دامنه با رکورد A به سرور و گواهی TLS
- فایروال: فقط پورت‌های 80 و 443 (و SSH) باز باشند

## گام‌ها

```bash
git clone <repo> /opt/bale-campaign && cd /opt/bale-campaign
cp .env.example .env
chmod 600 .env
```

در `.env`:

```dotenv
NODE_ENV=production
POSTGRES_PASSWORD=<openssl rand -hex 32>
REDIS_PASSWORD=<openssl rand -hex 32>
APP_URL=https://panel.example.com
COOKIE_SECURE=true
SWAGGER_ENABLED=false
NGINX_SITE=https
HTTP_BIND=0.0.0.0
HTTP_PORT=80
HTTPS_BIND=0.0.0.0
HTTPS_PORT=443
TLS_CERT_DIR=/etc/letsencrypt/live/panel.example.com
SMTP_URL=smtps://user:pass@smtp.example.com:465
MAIL_FROM="بله‌کمپین <no-reply@example.com>"
```

> `TLS_CERT_DIR` باید شامل `fullchain.pem` و `privkey.pem` باشد. با Let's Encrypt، چون فایل‌های `live/` symlink هستند، کل `/etc/letsencrypt` را mount کنید یا فایل‌ها را در پوشه‌ای جدا کپی کنید.

```bash
docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps
curl -fsS https://panel.example.com/api/v1/health/ready
docker compose exec -e ADMIN_EMAIL=ops@example.com -e ADMIN_FULL_NAME="مدیر" -e ADMIN_PASSWORD='...' api node dist/cli/create-admin.js
```

## ترتیب راه‌اندازی

`postgres`, `redis` (healthy) → `migrate` (یک‌باره، باید با کد ۰ تمام شود) → `api`, `worker`, `scheduler` (healthy) → `web` → `nginx`.
اگر migration شکست بخورد، API بالا نمی‌آید: `docker compose logs migrate`.

## به‌روزرسانی

```bash
git pull
./infra/scripts/backup.sh /var/backups/bcp     # همیشه قبل از به‌روزرسانی
docker compose build
docker compose up -d                           # migrate پیش از api اجرا می‌شود
```

هرگز `docker compose down -v` اجرا نکنید.

## پایش

- `docker compose ps` وضعیت healthcheck همه سرویس‌ها را نشان می‌دهد.
- endpointها: `/api/v1/health/ready` (عمومی)، worker و scheduler روی پورت داخلی 4100/4200 مسیر `/health/ready`.
- لاگ‌ها JSON (pino) هستند و با چرخش ۱۰ مگابایت × ۵ فایل نگهداری می‌شوند: `docker compose logs -f api`.
- هر پاسخ خطا `requestId` دارد که در لاگ API قابل جست‌وجوست.
- محدودیت منابع هر سرویس در `docker-compose.yml` (`deploy.resources.limits`) تعریف شده است.

## ساخت ایمیج پشت پروکسی

اگر npm registry فقط از طریق پروکسی با گواهی سازمانی در دسترس است:

```bash
docker build --network host --secret id=extra_ca,src=/path/corp-ca.crt \
  --build-arg HTTPS_PROXY=http://proxy:3128 -f infra/docker/Dockerfile --target api -t bale-campaign/api:0.1.0 .
```
