import type { Metadata } from "next";

export const metadata: Metadata = { title: "پرسش‌های متداول" };

const FAQ = [
  {
    q: "آیا بله‌کمپین با پیام‌رسان بله همکاری رسمی دارد؟",
    a: "خیر. بله‌کمپین یک محصول مستقل است و فقط از API عمومی و رسمی بازوی بله استفاده خواهد کرد.",
  },
  {
    q: "آیا می‌توانم به هر شماره‌ای پیام بفرستم؟",
    a: "خیر. طبق مستندات رسمی، بازوی بله فقط به چت‌هایی پیام می‌دهد که امکان آن در API فراهم است. ارسال انبوه ناخواسته و دور زدن محدودیت‌های بله مجاز نیست و پشتیبانی نمی‌شود.",
  },
  {
    q: "چرا گزارش‌ها «تحویل‌شده» نشان نمی‌دهند؟",
    a: "API بله فقط پذیرش پیام را اعلام می‌کند و رسید تحویل ندارد. ما وضعیتی را که ارائه‌دهنده تأیید نکرده باشد ثبت نمی‌کنیم.",
  },
  {
    q: "اطلاعات مخاطبان من کجا نگه‌داری می‌شود و چه کسی به آن دسترسی دارد؟",
    a: "داده‌های هر فضای کاری جدا از دیگران نگه‌داری می‌شود و فقط اعضای همان فضای کاری، بر اساس نقش‌شان، به آن دسترسی دارند. کارکنان پشتیبانی به‌صورت پیش‌فرض به اطلاعات محرمانه اتصال‌ها دسترسی ندارند.",
  },
  {
    q: "اگر رمز عبورم را فراموش کنم چه کنم؟",
    a: "از صفحه ورود، گزینه «فراموشی رمز» را بزنید. پیوند بازیابی به ایمیل شما ارسال می‌شود و فقط یک بار و تا ۶۰ دقیقه معتبر است.",
  },
  {
    q: "هزینه استفاده چقدر است؟",
    a: "پلن‌های فروش هنوز منتشر نشده‌اند و در دوره آزمایشی هزینه‌ای دریافت نمی‌شود.",
  },
];

export default function FaqPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold sm:text-3xl">پرسش‌های متداول</h1>
      <div className="mt-8 space-y-3">
        {FAQ.map((item) => (
          <details key={item.q} className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer list-none font-medium text-slate-900 marker:hidden">
              <span className="me-2 inline-block text-brand-600 transition-transform group-open:rotate-90" aria-hidden="true">‹</span>
              {item.q}
            </summary>
            <p className="mt-3 leading-8 text-slate-600">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
