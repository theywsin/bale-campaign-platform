// End-to-end tests for support tickets, admin operations, system settings, 2FA and the nonce CSP.
//   E2E_BASE_URL=http://localhost:3000 E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npm run test:e2e
// The admin flows need a platform admin without 2FA (npm run admin:create) and are skipped otherwise.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.E2E_SCREENSHOTS ?? "test-results/e2e";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const PASSWORD = "E2ePassw0rd123";
const MOBILE = { width: 390, height: 844 };
const uid = () => randomBytes(4).toString("hex");

/** RFC 6238 TOTP, the same algorithm an authenticator app runs. */
function totp(secretBase32, offset = 0) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secretBase32.replace(/=+$/, "")) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offset));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

let browser;
before(async () => {
  mkdirSync(SHOTS, { recursive: true });
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

/** A page that records CSP violations and uncaught errors, so every test also checks the policy. */
async function newPage(viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, locale: "fa-IR", ignoreHTTPSErrors: process.env.E2E_INSECURE_TLS === "1" });
  const page = await context.newPage();
  page.problems = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) page.problems.push(m.text());
  });
  page.on("pageerror", (e) => page.problems.push(e.message));
  return page;
}

async function register(page, email = `e2e-s-${uid()}@example.test`) {
  await page.goto(`${BASE}/register`);
  await page.getByLabel("نام و نام خانوادگی").fill("مشتری پشتیبانی");
  await page.getByLabel("ایمیل").fill(email);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await page.getByLabel("نام کسب‌وکار یا فضای کاری").fill("فروشگاه پشتیبانی");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "ساخت حساب" }).click();
  await page.waitForURL(/\/app\/[0-9a-f-]{36}/);
  return { email, orgId: new URL(page.url()).pathname.split("/")[2] };
}

async function adminLogin(page) {
  await page.goto(`${BASE}/login?next=/admin`);
  await page.getByLabel("ایمیل").fill(ADMIN_EMAIL);
  await page.getByLabel("رمز عبور").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "ورود" }).click();
  await page.waitForURL((u) => u.pathname === "/admin");
}

describe("public pages under the nonce CSP", () => {
  test("pages hydrate with a per-request nonce and no CSP violations", async () => {
    const page = await newPage();
    const res = await page.goto(`${BASE}/pricing`);
    const csp = res.headers()["content-security-policy"];
    assert.match(csp, /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
    // Client-side navigation only works once React has hydrated.
    await page.getByRole("link", { name: "ورود" }).first().click();
    await page.waitForURL(/\/login/);
    await page.getByLabel("ایمیل").fill("x");
    await page.getByRole("button", { name: "ورود" }).click();
    await page.getByText("ایمیل معتبر نیست.").waitFor();
    assert.deepEqual(page.problems, []);
    await page.context().close();
  });
});

describe("two-factor authentication", () => {
  test("a user enables TOTP, signs in with a code and then with a recovery code", async () => {
    const page = await newPage();
    const { email, orgId } = await register(page);
    await page.goto(`${BASE}/app/${orgId}/account`);
    await page.getByRole("button", { name: "فعال‌سازی ورود دومرحله‌ای" }).click();
    await page.getByRole("img", { name: /کد QR/ }).waitFor();
    const secret = (await page.locator("code").first().innerText()).trim();
    await page.screenshot({ path: `${SHOTS}/completion-2fa-setup.png`, fullPage: true });
    const confirm = page.getByRole("form", { name: "تأیید ورود دومرحله‌ای" });
    await confirm.getByLabel("کد تأیید").fill("000000");
    await confirm.getByRole("button", { name: "تأیید و فعال‌سازی" }).click();
    await page.getByText("کد نادرست است.").first().waitFor();
    await confirm.getByLabel("کد تأیید").fill(totp(secret));
    await confirm.getByRole("button", { name: "تأیید و فعال‌سازی" }).click();
    const codes = (await page.getByLabel("کدهای بازیابی").inputValue()).split("\n");
    assert.equal(codes.length, 10);
    await page.screenshot({ path: `${SHOTS}/completion-2fa-recovery.png`, fullPage: true });
    await page.getByRole("button", { name: "ذخیره کردم، بستن" }).click();

    // A fresh browser: password alone is not enough.
    const other = await newPage(MOBILE);
    await other.goto(`${BASE}/login`);
    await other.getByLabel("ایمیل").fill(email);
    await other.getByLabel("رمز عبور").fill(PASSWORD);
    await other.getByRole("button", { name: "ورود" }).click();
    const step = other.getByRole("form", { name: "ورود دومرحله‌ای" });
    await step.waitFor();
    await other.screenshot({ path: `${SHOTS}/completion-2fa-login-mobile.png`, fullPage: true });
    await step.getByLabel("کد تأیید").fill("123456");
    await step.getByRole("button", { name: "تأیید و ورود" }).click();
    await other.getByText("کد نادرست است.").first().waitFor();
    await step.getByRole("button", { name: /استفاده از کد بازیابی/ }).click();
    await step.getByLabel("کد بازیابی").fill(codes[0]);
    await step.getByRole("button", { name: "تأیید و ورود" }).click();
    await other.waitForURL(/\/app\//);
    assert.deepEqual([...page.problems, ...other.problems], []);
    await other.context().close();

    // Disable with password + another recovery code.
    await page.getByRole("button", { name: "غیرفعال کردن" }).click();
    const off = page.getByRole("form", { name: "غیرفعال کردن ورود دومرحله‌ای" });
    await off.getByLabel("رمز عبور").fill(PASSWORD);
    await off.getByLabel("کد تأیید یا کد بازیابی").fill(codes[1]);
    await off.getByRole("button", { name: "غیرفعال کردن" }).click();
    await page.getByText("ورود دومرحله‌ای غیرفعال شد.").waitFor();
    await page.context().close();
  });
});

describe("support tickets and admin operations", { skip: !ADMIN_EMAIL && "E2E_ADMIN_EMAIL not set" }, () => {
  test("customer opens a ticket, support answers, customer sees the answer and closes it", async () => {
    const customer = await newPage();
    const { orgId } = await register(customer);
    await customer.goto(`${BASE}/app/${orgId}/support`);
    await customer.getByText("هنوز تیکتی ثبت نکرده‌اید").waitFor();
    await customer.getByRole("button", { name: "تیکت جدید" }).click();
    const form = customer.getByRole("form", { name: "ثبت تیکت" });
    const subject = `ارسال انجام نمی‌شود ${uid()}`;
    await form.getByLabel("موضوع").fill(subject);
    await form.getByLabel("دسته").selectOption("TECHNICAL");
    await form.getByLabel("شرح").fill("کمپین دیروز در وضعیت در صف مانده است.");
    await form.getByRole("button", { name: "ثبت تیکت" }).click();
    await customer.waitForURL(/\/support\/[0-9a-f-]{36}$/);
    await customer.getByText("در انتظار پاسخ پشتیبانی").first().waitFor();

    const admin = await newPage();
    await adminLogin(admin);
    await admin.getByRole("link", { name: "تیکت‌ها" }).click();
    await admin.getByRole("link", { name: subject }).click();
    await admin.getByLabel("پاسخ شما").fill("صف ارسال بررسی شد؛ لطفاً حساب بله را دوباره آزمایش کنید.");
    await admin.getByRole("button", { name: "ارسال پاسخ" }).click();
    await admin.getByText("پاسخ داده شد").first().waitFor();
    await admin.screenshot({ path: `${SHOTS}/completion-admin-ticket.png`, fullPage: true });

    await customer.reload();
    await customer.getByText("صف ارسال بررسی شد").waitFor();
    await customer.getByText("پاسخ داده شد").first().waitFor();
    await customer.screenshot({ path: `${SHOTS}/completion-ticket-customer.png`, fullPage: true });
    await customer.getByRole("button", { name: "بستن تیکت" }).click();
    await customer.getByRole("dialog").getByRole("button", { name: "بستن" }).click();
    await customer.getByText("بسته", { exact: true }).first().waitFor();

    // Admin pages render with real data.
    await admin.goto(`${BASE}/admin/providers`);
    await admin.getByText("رویدادهای در انتظار (Outbox)").waitFor();
    await admin.screenshot({ path: `${SHOTS}/completion-admin-providers.png`, fullPage: true });
    await admin.goto(`${BASE}/admin/campaigns`);
    await admin.getByRole("heading", { name: "پایش کمپین‌ها" }).waitFor();
    await admin.screenshot({ path: `${SHOTS}/completion-admin-campaigns.png`, fullPage: true });
    assert.deepEqual([...customer.problems, ...admin.problems], []);
    await customer.context().close();
    await admin.context().close();
  });

  test("an announcement appears in the customer panel and closed registration is explained", async () => {
    const admin = await newPage();
    await adminLogin(admin);
    await admin.goto(`${BASE}/admin/settings`);
    const form = admin.getByRole("form", { name: "تنظیمات سامانه" });
    const text = `به‌روزرسانی برنامه‌ریزی‌شده ${uid()}`;
    await form.getByLabel("اطلاعیه پنل").fill(text);
    await form.getByRole("checkbox").uncheck();
    await form.getByRole("button", { name: "ذخیره تنظیمات" }).click();
    await admin.getByText("تنظیمات ذخیره شد.").waitFor();
    await admin.screenshot({ path: `${SHOTS}/completion-admin-settings.png`, fullPage: true });
    try {
      // The API caches settings for a few seconds.
      await new Promise((r) => setTimeout(r, 5500));
      const visitor = await newPage(MOBILE);
      await visitor.goto(`${BASE}/register`);
      await visitor.getByText("ثبت‌نام موقتاً بسته است").waitFor();
      await visitor.screenshot({ path: `${SHOTS}/completion-register-closed-mobile.png`, fullPage: true });
      await visitor.context().close();

      await admin.goto(`${BASE}/app`);
      await admin.waitForURL(/\/app\/[0-9a-f-]{36}|\/app\/new-workspace/);
      if (/\/app\/[0-9a-f-]{36}/.test(admin.url())) await admin.getByText(text).waitFor();
    } finally {
      await admin.goto(`${BASE}/admin/settings`);
      const f = admin.getByRole("form", { name: "تنظیمات سامانه" });
      await f.getByLabel("اطلاعیه پنل").fill("");
      await f.getByRole("checkbox").check();
      await f.getByRole("button", { name: "ذخیره تنظیمات" }).click();
      await admin.getByText("تنظیمات ذخیره شد.").waitFor();
    }
    await admin.context().close();
  });
});
