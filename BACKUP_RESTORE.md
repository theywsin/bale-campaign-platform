# پشتیبان‌گیری و بازیابی

## پشتیبان‌گیری

`infra/scripts/backup.sh` از دیتابیس با `pg_dump` (فرمت custom) خروجی می‌گیرد، آن را با GnuPG (AES256) رمز می‌کند و checksum می‌نویسد.

```bash
# یک‌بار: ساخت فایل passphrase خارج از مخزن و خارج از مقصد بکاپ
openssl rand -base64 48 > /root/.bcp-backup-pass && chmod 600 /root/.bcp-backup-pass

BACKUP_PASSPHRASE_FILE=/root/.bcp-backup-pass ./infra/scripts/backup.sh /var/backups/bcp
```

- نگهداری: فایل‌های قدیمی‌تر از `BACKUP_RETENTION_DAYS` (پیش‌فرض ۱۴ روز) حذف می‌شوند.
- زمان‌بندی پیشنهادی (cron روزانه ساعت ۳ UTC):
  ```cron
  0 3 * * * cd /opt/bale-campaign && BACKUP_PASSPHRASE_FILE=/root/.bcp-backup-pass ./infra/scripts/backup.sh /var/backups/bcp >> /var/log/bcp-backup.log 2>&1
  ```
- یک نسخه از بکاپ‌ها را خارج از سرور (فضای ذخیره‌سازی S3-compatible یا سرور دیگر) نگه دارید. passphrase را جدا از بکاپ‌ها و در مدیر رمز سازمان نگه دارید؛ بدون آن بازیابی ممکن نیست.
- Redis فقط صف و شمارنده‌های موقت را نگه می‌دارد (با AOF). از دست رفتن آن داده کسب‌وکاری را از بین نمی‌برد؛ ایمیل‌های در صف ممکن است ارسال نشوند.

## بازیابی

اسکریپت به‌صورت پیش‌فرض در **دیتابیس جدید** بازیابی می‌کند تا داده فعلی دست نخورد:

```bash
BACKUP_PASSPHRASE_FILE=/root/.bcp-backup-pass ./infra/scripts/restore.sh /var/backups/bcp/bcp-20261025T030000Z.dump.gpg
# → دیتابیس bcp_restore_20261025t030000z
```

### بازیابی کامل (فاجعه)

```bash
docker compose stop api worker scheduler web
BACKUP_PASSPHRASE_FILE=/root/.bcp-backup-pass ./infra/scripts/restore.sh <file> bcp
docker compose up -d
curl -fsS http://127.0.0.1:8080/api/v1/health/ready
```

## تست بازیابی

بکاپی که بازیابی آن تست نشده، قابل اتکا نیست. حداقل ماهی یک‌بار:

1. آخرین بکاپ را در دیتابیس جدید بازیابی کنید (دستور پیش‌فرض بالا).
2. تعداد ردیف‌ها را مقایسه کنید:
   ```bash
   docker compose exec postgres psql -U bcp -d bcp_restore_<stamp> -c "SELECT count(*) FROM users; SELECT count(*) FROM organizations;"
   ```
3. دیتابیس آزمایشی را حذف کنید: `docker compose exec postgres dropdb -U bcp bcp_restore_<stamp>`

این روند در محیط توسعه اجرا و تأیید شده است (بخش «نتایج تست» در IMPLEMENTATION_PLAN.md).
