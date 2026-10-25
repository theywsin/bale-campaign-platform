// End-to-end tests for phase C: contacts, CSV import, test-only messaging account,
// campaign creation, sending through the real worker/scheduler, and the report.
//   E2E_BASE_URL=http://localhost:3000 npm run test:e2e
// Requires the full stack (API, worker, scheduler, web) with MESSAGING_MOCK_ENABLED=true;
// the campaign test is skipped when the mock provider is disabled.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.E2E_SCREENSHOTS ?? "test-results/e2e";
const PASSWORD = "E2ePassw0rd123";
const uid = () => randomBytes(4).toString("hex");

let browser;
before(async () => {
  mkdirSync(SHOTS, { recursive: true });
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

async function newPage(viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, locale: "fa-IR", acceptDownloads: true });
  return context.newPage();
}

async function register(page) {
  await page.goto(`${BASE}/register`);
  await page.getByLabel("نام و نام خانوادگی").fill("کاربر کمپین");
  await page.getByLabel("ایمیل").fill(`e2e-c-${uid()}@example.test`);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await page.getByLabel("نام کسب‌وکار یا فضای کاری").fill("فروشگاه کمپین");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "ساخت حساب" }).click();
  await page.waitForURL(/\/app\/[0-9a-f-]{36}/);
  return new URL(page.url()).pathname.split("/")[2];
}

describe("contacts and campaigns", () => {
  test("add a contact, import CSV with an error report, and export", async () => {
    const page = await newPage();
    const orgId = await register(page);

    await page.getByRole("link", { name: "مخاطبان", exact: true }).click();
    await page.getByText("هنوز مخاطبی ثبت نشده است").waitFor();
    await page.getByRole("button", { name: "مخاطب جدید" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("نام", { exact: true }).fill("سارا");
    await dialog.getByLabel("شماره موبایل").fill("0912");
    await dialog.getByRole("button", { name: "ذخیره" }).click();
    await dialog.getByText("شماره موبایل معتبر نیست.").waitFor();
    await dialog.getByLabel("شماره موبایل").fill("۰۹۱۲۱۲۳۴۵۶۷");
    await dialog.getByRole("button", { name: "ذخیره" }).click();
    await page.getByText("مخاطب اضافه شد.").waitFor();
    await page.getByRole("cell", { name: "09121234567" }).waitFor();

    const csv = path.join(tmpdir(), `contacts-${uid()}.csv`);
    writeFileSync(csv, "نام,موبایل,شناسه چت\nعلی,09120000001,4000\nبد,123,\nرضا,,4001\n");
    await page.goto(`${BASE}/app/${orgId}/contacts/import`);
    await page.getByLabel("فایل CSV (UTF-8)").setInputFiles(csv);
    await page.getByText(path.basename(csv)).waitFor();
    await page.getByRole("button", { name: "بارگذاری و ورود" }).click();
    await page.getByText("ورود فایل انجام شد").waitFor();
    await page.getByRole("cell", { name: "شماره موبایل معتبر نیست." }).waitFor();
    await page.screenshot({ path: `${SHOTS}/contacts-import.png`, fullPage: true });

    await page.goto(`${BASE}/app/${orgId}/contacts`);
    await page.getByRole("cell", { name: "4001" }).waitFor();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "خروجی CSV" }).click()]);
    const file = await download.path();
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(file, "utf8");
    assert.match(text, /first_name,last_name,phone,bale_chat_id/);
    assert.match(text, /\+989120000001/);
    await page.screenshot({ path: `${SHOTS}/contacts.png`, fullPage: true });
    await page.context().close();
  });

  test("send a campaign through the test-only account and read the report", async (t) => {
    const page = await newPage();
    const orgId = await register(page);

    await page.goto(`${BASE}/app/${orgId}/messaging-accounts`);
    await page.getByRole("heading", { name: "حساب آزمایشی (Mock)" }).waitFor();
    if (await page.getByText("حساب آزمایشی در این استقرار غیرفعال است.").isVisible()) {
      t.skip("MESSAGING_MOCK_ENABLED is false on this stack");
      await page.context().close();
      return;
    }
    await page.getByLabel("سقف پیام در دقیقه").fill("600");
    await page.getByRole("button", { name: "ساخت حساب آزمایشی" }).click();
    await page.getByText("آزمایشی — پیام واقعی ارسال نمی‌شود").waitFor();

    // Contacts: accepted, rejected (…991), unknown (…993), and one without chat id.
    const csv = path.join(tmpdir(), `campaign-${uid()}.csv`);
    writeFileSync(csv, "name,phone,bale_chat_id\nیک,,9000\nدو,,9991\nسه,,9993\nچهار,09125550000,\n");
    await page.goto(`${BASE}/app/${orgId}/contacts/import`);
    await page.getByLabel("فایل CSV (UTF-8)").setInputFiles(csv);
    await page.getByRole("button", { name: "بارگذاری و ورود" }).click();
    await page.getByText("ورود فایل انجام شد").waitFor();

    await page.goto(`${BASE}/app/${orgId}/campaigns`);
    await page.getByRole("link", { name: "کمپین جدید" }).click();
    // Choosing the account first also waits for the form's data to load.
    await page.getByLabel("حساب ارسال").selectOption({ index: 1 });
    await page.getByLabel("نام کمپین").fill("تخفیف پاییزه");
    await page.getByLabel("متن پیام").fill("سلام! تخفیف ۲۰ درصدی تا پایان هفته.");
    await page.getByRole("button", { name: "ذخیره پیش‌نویس" }).click();
    await page.waitForURL(/\/campaigns\/[0-9a-f-]{36}$/);
    await page.getByRole("heading", { name: "تخفیف پاییزه" }).waitFor();

    await page.getByRole("button", { name: "شروع ارسال" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "شروع ارسال" }).click();
    // The scheduler relays the outbox event and the worker sends; the page polls.
    await page.getByText("پایان‌یافته", { exact: true }).waitFor({ timeout: 60_000 });
    await page.getByRole("option", { name: "نامشخص (۱)" }).waitFor({ state: "attached" });
    await page.getByRole("option", { name: "پذیرفته‌شده توسط سرویس (۱)" }).waitFor({ state: "attached" });
    await page.getByRole("option", { name: "ناموفق (۲)" }).waitFor({ state: "attached" });
    await page.getByText("شناسه چت بله ندارد", { exact: false }).first().waitFor();
    // The recipient table reflects the final states, not the snapshot taken at start.
    await page.getByRole("cell", { name: "پذیرفته‌شده توسط سرویس" }).waitFor();
    await page.getByRole("cell", { name: "نامشخص" }).waitFor();
    assert.equal(await page.getByRole("cell", { name: "در انتظار" }).count(), 0);
    await page.screenshot({ path: `${SHOTS}/campaign-report.png`, fullPage: true });

    // Mobile layout has no horizontal overflow.
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `horizontal overflow ${overflow}px`);
    await page.screenshot({ path: `${SHOTS}/campaign-report-mobile.png`, fullPage: true });
    await page.context().close();
  });
});
