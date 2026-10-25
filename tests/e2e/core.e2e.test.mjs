// End-to-end tests for phase B, driving a real browser against a running stack.
//   E2E_BASE_URL=http://localhost:3000 npm run test:e2e
// Requires: API + web running (see README), Chromium installed for Playwright.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
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

async function newPage(viewport = { width: 1280, height: 860 }) {
  const context = await browser.newContext({ viewport, locale: "fa-IR" });
  return context.newPage();
}

async function register(page, { email, name = "کاربر آزمون", org = "فروشگاه آزمون" }) {
  await page.goto(`${BASE}/register`);
  await page.getByLabel("نام و نام خانوادگی").fill(name);
  await page.getByLabel("ایمیل").fill(email);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await page.getByLabel("نام کسب‌وکار یا فضای کاری").fill(org);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "ساخت حساب" }).click();
  await page.waitForURL(/\/app\/[0-9a-f-]{36}/);
}

describe("public site", () => {
  test("home page is Persian, RTL and uses Vazirmatn", async () => {
    const page = await newPage();
    await page.goto(BASE);
    assert.equal(await page.getAttribute("html", "dir"), "rtl");
    assert.equal(await page.getAttribute("html", "lang"), "fa");
    const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    assert.match(font, /vazirmatn/i);
    await page.screenshot({ path: `${SHOTS}/home.png`, fullPage: true });
    await page.context().close();
  });

  test("status page shows live service health", async () => {
    const page = await newPage();
    await page.goto(`${BASE}/status`);
    await page.getByText("همه سرویس‌ها فعال هستند.").waitFor();
    await page.context().close();
  });

  test("protected pages redirect to login", async () => {
    const page = await newPage();
    await page.goto(`${BASE}/app`);
    await page.waitForURL(/\/login\?next=%2Fapp/);
    await page.context().close();
  });
});

describe("account lifecycle", () => {
  test("sign up, see the workspace dashboard, sign out and sign back in", async () => {
    const page = await newPage();
    const email = `e2e-${uid()}@example.test`;

    // Client-side validation in Persian.
    await page.goto(`${BASE}/register`);
    await page.getByRole("button", { name: "ساخت حساب" }).click();
    await page.getByText("ایمیل معتبر نیست.").waitFor();

    await register(page, { email, org: "کافه آزمون" });
    await page.getByText("به بله‌کمپین خوش آمدید").waitFor();
    await page.getByRole("heading", { name: "کافه آزمون" }).waitFor();
    await page.getByText("ایجاد فضای کاری").first().waitFor();
    await page.screenshot({ path: `${SHOTS}/dashboard.png`, fullPage: true });

    await page.getByRole("button", { name: "خروج" }).click();
    await page.waitForURL(/\/login/);

    await page.getByLabel("ایمیل").fill(email);
    await page.getByLabel("رمز عبور").fill("WrongPassw0rd");
    await page.getByRole("button", { name: "ورود" }).click();
    await page.getByText("ایمیل یا رمز عبور نادرست است.").waitFor();

    await page.getByLabel("رمز عبور").fill(PASSWORD);
    await page.getByRole("button", { name: "ورود" }).click();
    await page.waitForURL(/\/app\/[0-9a-f-]{36}$/);
    await page.context().close();
  });

  test("create a second workspace and switch between them", async () => {
    const page = await newPage();
    await register(page, { email: `e2e-${uid()}@example.test`, org: "فضای اول" });
    await page.goto(`${BASE}/app/new-workspace`);
    await page.getByLabel("نام فضای کاری").fill("فضای دوم");
    await page.getByRole("button", { name: "ساخت فضای کاری" }).click();
    await page.getByRole("heading", { name: "فضای دوم" }).waitFor();
    const options = await page.locator("#org-switcher option").allTextContents();
    assert.ok(options.some((o) => o.includes("فضای اول")));
    assert.ok(options.some((o) => o.includes("فضای دوم")));
    await page.context().close();
  });

  test("invite a member and revoke the invitation with confirmation", async () => {
    const page = await newPage();
    await register(page, { email: `e2e-${uid()}@example.test` });
    await page.getByRole("link", { name: "اعضا و نقش‌ها" }).first().click();
    const invitee = `invitee-${uid()}@example.test`;
    await page.getByRole("textbox", { name: "ایمیل" }).fill(invitee);
    await page.getByRole("button", { name: "ارسال دعوت‌نامه" }).click();
    await page.getByText(`دعوت‌نامه برای ${invitee} ثبت شد.`).waitFor();
    await page.screenshot({ path: `${SHOTS}/members.png`, fullPage: true });

    await page.getByRole("button", { name: "لغو", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "لغو دعوت‌نامه" }).click();
    await page.getByText("دعوت‌نامه لغو شد.").waitFor();
    await page.context().close();
  });

  test("account page lists the current session and changes the password", async () => {
    const page = await newPage();
    await register(page, { email: `e2e-${uid()}@example.test` });
    await page.getByRole("link", { name: "پروفایل و امنیت" }).first().click();
    await page.getByText("این دستگاه", { exact: true }).waitFor();
    await page.getByLabel("رمز فعلی").fill(PASSWORD);
    await page.getByLabel("رمز جدید").fill("An0therGoodPass");
    await page.getByRole("button", { name: "تغییر رمز" }).click();
    await page.getByText("رمز عبور تغییر کرد. سایر نشست‌ها بسته شدند.").waitFor();
    // The current device stays signed in.
    await page.reload();
    await page.getByText("این دستگاه", { exact: true }).waitFor();
    await page.context().close();
  });

  test("customers cannot open the admin panel", async () => {
    const page = await newPage();
    await register(page, { email: `e2e-${uid()}@example.test` });
    await page.goto(`${BASE}/admin`);
    await page.getByText("شما به پنل مدیریت سامانه دسترسی ندارید.").waitFor();
    await page.context().close();
  });

  test("panel works on a phone-sized screen", async () => {
    const page = await newPage({ width: 390, height: 844 });
    await register(page, { email: `e2e-${uid()}@example.test` });
    await page.getByRole("button", { name: "باز کردن منو" }).click();
    await page.getByRole("link", { name: "اعضا و نقش‌ها" }).click();
    await page.getByRole("heading", { name: "اعضا و نقش‌ها" }).waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, "page must not scroll horizontally");
    await page.screenshot({ path: `${SHOTS}/mobile-members.png`, fullPage: true });
    await page.context().close();
  });
});

// Needs a platform admin created with `npm run admin:create`; skipped otherwise.
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

describe("admin panel", { skip: !ADMIN_EMAIL || !ADMIN_PASSWORD ? "set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD" : false }, () => {
  test("a super admin sees stats, searches users and suspends one with confirmation", async () => {
    const customer = await newPage();
    const customerEmail = `e2e-${uid()}@example.test`;
    await register(customer, { email: customerEmail });

    const page = await newPage();
    await page.goto(`${BASE}/login?next=/admin`);
    await page.getByLabel("ایمیل").fill(ADMIN_EMAIL);
    await page.getByLabel("رمز عبور").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "ورود" }).click();
    await page.waitForURL(/\/admin$/);
    await page.getByText("کل کاربران").waitFor();
    await page.screenshot({ path: `${SHOTS}/admin-dashboard.png`, fullPage: true });

    await page.getByRole("link", { name: "کاربران" }).first().click();
    await page.getByRole("searchbox", { name: "جست‌وجوی کاربر" }).fill(customerEmail);
    const row = page.getByRole("row").filter({ hasText: customerEmail });
    await row.waitFor();
    await row.getByRole("button", { name: "تعلیق" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "تعلیق حساب" }).click();
    await page.getByText(`حساب ${customerEmail} تعلیق شد.`).waitFor();
    await page.screenshot({ path: `${SHOTS}/admin-users.png`, fullPage: true });

    // The suspended customer's open session is gone.
    await customer.reload();
    await customer.waitForURL(/\/login/);

    await page.getByRole("link", { name: "گزارش ممیزی" }).first().click();
    await page.getByText("تغییر وضعیت کاربر").first().waitFor();
    await customer.context().close();
    await page.context().close();
  });
});
