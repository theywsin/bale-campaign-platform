// End-to-end tests for phase E: plans, test-only checkout, licenses and limits in the panel.
//   E2E_BASE_URL=http://localhost:3000 E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npm run test:e2e
// Needs a platform admin (npm run admin:create) and PAYMENTS_MOCK_ENABLED=true; skipped otherwise.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.E2E_SCREENSHOTS ?? "test-results/e2e";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
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
  const context = await browser.newContext({ viewport, locale: "fa-IR", ignoreHTTPSErrors: process.env.E2E_INSECURE_TLS === "1" });
  return context.newPage();
}

async function register(page) {
  await page.goto(`${BASE}/register`);
  await page.getByLabel("نام و نام خانوادگی").fill("خریدار آزمایشی");
  await page.getByLabel("ایمیل").fill(`e2e-b-${uid()}@example.test`);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await page.getByLabel("نام کسب‌وکار یا فضای کاری").fill("فروشگاه خرید");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "ساخت حساب" }).click();
  await page.waitForURL(/\/app\/[0-9a-f-]{36}/);
  return new URL(page.url()).pathname.split("/")[2];
}

async function adminLogin(page) {
  await page.goto(`${BASE}/login?next=/admin`);
  await page.getByLabel("ایمیل").fill(ADMIN_EMAIL);
  await page.getByLabel("رمز عبور").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "ورود" }).click();
  await page.waitForURL((u) => u.pathname === "/admin");
}

async function createPlan(admin, { code, name, price, contacts }) {
  await admin.goto(`${BASE}/admin/plans`);
  await admin.getByRole("button", { name: "پلن جدید" }).click();
  const form = admin.getByRole("form", { name: "فرم پلن" });
  await form.getByLabel("کد (انگلیسی)").fill(code);
  await form.getByLabel("نام", { exact: true }).fill(name);
  await form.getByLabel("قیمت (ریال)").fill(String(price));
  await form.getByLabel("مدت (روز)").fill("30");
  await form.getByLabel("سقف مخاطب").fill(String(contacts));
  await form.getByRole("button", { name: "ذخیره" }).click();
  await admin.getByText(code, { exact: true }).waitFor();
}

async function deactivatePlan(admin, code) {
  await admin.goto(`${BASE}/admin/plans`);
  await admin.getByRole("listitem").filter({ hasText: code }).getByRole("button", { name: "ویرایش" }).click();
  const form = admin.getByRole("form", { name: "فرم پلن" });
  await form.getByLabel("فعال (قابل خرید و اعمال)").uncheck();
  await form.getByRole("button", { name: "ذخیره" }).click();
  await admin.getByRole("listitem").filter({ hasText: code }).getByText("غیرفعال").waitFor();
}

describe("billing", { skip: !ADMIN_EMAIL || !ADMIN_PASSWORD ? "set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD" : false }, () => {
  test("admin defines plans and licenses; a customer buys through the test gateway, redeems a key and hits a limit", async () => {
    const admin = await newPage();
    await adminLogin(admin);
    const id = uid();
    const paid = { code: `e2e-pro-${id}`, name: `حرفه‌ای ${id}`, price: 2500000, contacts: 1 };
    const gift = { code: `e2e-gift-${id}`, name: `هدیه ${id}`, price: 900000, contacts: 50 };
    await createPlan(admin, paid);
    await createPlan(admin, gift);
    await admin.screenshot({ path: `${SHOTS}/admin-plans.png`, fullPage: true });

    // License: the key is shown once.
    await admin.goto(`${BASE}/admin/licenses`);
    await admin.getByRole("button", { name: "ساخت کلید" }).click();
    const lf = admin.getByRole("form", { name: "ساخت کلید لایسنس" });
    await lf.getByLabel("پلن").selectOption({ label: gift.name });
    await lf.getByLabel("یادداشت").fill(`e2e ${id}`);
    await lf.getByRole("button", { name: "ساخت" }).click();
    const keyBox = admin.getByLabel("کلیدهای ساخته‌شده");
    await keyBox.waitFor();
    const key = (await keyBox.inputValue()).trim();
    assert.match(key, /^BCP(-[0-9A-Z]{4}){4}$/);
    await admin.screenshot({ path: `${SHOTS}/admin-licenses.png`, fullPage: true });
    await admin.getByRole("button", { name: "ذخیره کردم، بستن" }).click();
    assert.equal(await admin.getByText(key).count(), 0);

    // Customer buys the paid plan.
    const page = await newPage();
    const orgId = await register(page);
    await page.getByRole("link", { name: "اشتراک و پرداخت" }).click();
    await page.getByRole("heading", { name: "پلن فعلی" }).waitFor();
    if (await page.getByText("پرداخت آنلاین در این استقرار فعال نیست").count()) {
      test.skip?.("mock gateway disabled");
      return;
    }
    await page.getByText("درگاه پرداخت این استقرار آزمایشی است").waitFor();
    await page.getByRole("button", { name: `خرید ${paid.name}` }).click();
    await page.waitForURL(/\/billing\/mock-checkout\//);
    await page.getByText("این صفحه یک درگاه بانکی واقعی نیست").waitFor();
    await page.getByText("۲٬۵۰۰٬۰۰۰ ریال").waitFor();
    await page.screenshot({ path: `${SHOTS}/mock-checkout.png`, fullPage: true });
    await page.getByRole("button", { name: "شبیه‌سازی پرداخت موفق" }).click();
    await page.getByText("پرداخت آزمایشی موفق ثبت شد").waitFor();
    await page.getByRole("link", { name: "بازگشت به صفحه اشتراک" }).click();
    await page.getByText("پلن فعلی", { exact: true }).last().waitFor();
    await page.screenshot({ path: `${SHOTS}/billing-after-pay.png`, fullPage: true });
    await page.getByText("پرداخت‌شده").waitFor();
    await page.locator("p.text-lg").filter({ hasText: paid.name }).waitFor();

    // Limit: the paid plan allows one contact.
    await page.goto(`${BASE}/app/${orgId}/contacts`);
    for (const [i, chat] of ["6101", "6102"].entries()) {
      await page.getByRole("button", { name: "مخاطب جدید" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("نام", { exact: true }).fill(`مخاطب ${i}`);
      await dialog.getByLabel("شناسه چت بله").fill(chat);
      await dialog.getByRole("button", { name: "ذخیره" }).click();
      if (i === 0) await page.getByText("مخاطب اضافه شد.").waitFor();
    }
    await page.getByRole("dialog").getByText("در پلن فعلی پر شده است").waitFor();
    await page.screenshot({ path: `${SHOTS}/plan-limit.png`, fullPage: true });
    await page.keyboard.press("Escape");

    // Redeem the license: switches to the gift plan.
    await page.goto(`${BASE}/app/${orgId}/billing`);
    const rf = page.getByRole("form", { name: "فعال‌سازی لایسنس" });
    await rf.getByLabel("کلید لایسنس").fill("BCP-0000");
    await rf.getByRole("button", { name: "فعال‌سازی" }).click();
    await rf.getByText("قالب کلید لایسنس معتبر نیست.").waitFor();
    await rf.getByLabel("کلید لایسنس").fill(key.toLowerCase());
    await rf.getByRole("button", { name: "فعال‌سازی" }).click();
    await page.getByText("کلید لایسنس فعال شد.").waitFor();
    await page.locator("p.text-lg").filter({ hasText: gift.name }).waitFor();
    await page.getByText("از طریق کلید لایسنس").waitFor();
    await page.screenshot({ path: `${SHOTS}/billing.png`, fullPage: true });

    const mobile = await newPage({ width: 390, height: 844 });
    await mobile.context().addCookies(await page.context().cookies());
    await mobile.goto(`${BASE}/app/${orgId}/billing`);
    await mobile.getByRole("heading", { name: "مصرف" }).waitFor();
    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `horizontal overflow ${overflow}px`);
    await mobile.screenshot({ path: `${SHOTS}/billing-mobile.png`, fullPage: true });

    // Admin sees the paid order with its payment history.
    await admin.goto(`${BASE}/admin/payments`);
    const row = admin.getByRole("row").filter({ hasText: paid.name });
    await row.getByText("پرداخت‌شده").waitFor();
    await row.getByRole("button", { name: "تاریخچه پرداخت" }).click();
    await admin.getByText("درگاه آزمایشی — مرجع").first().waitFor();
    await admin.screenshot({ path: `${SHOTS}/admin-payments.png`, fullPage: true });

    // Public pricing reads the live plan table.
    const pub = await newPage();
    await pub.goto(`${BASE}/pricing`);
    await pub.getByRole("heading", { name: paid.name }).waitFor();

    await deactivatePlan(admin, paid.code);
    await deactivatePlan(admin, gift.code);
  });
});
