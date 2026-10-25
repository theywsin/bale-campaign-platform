import Link from "next/link";
import { ShieldCheck, Users, ListChecks, Send } from "lucide-react";
import { MODULES, STATUS_LABEL } from "@/lib/roadmap";
import { Badge } from "@/components/ui/card";

const HIGHLIGHTS = [
  { Icon: Users, title: "مخاطبان منظم", text: "مخاطبان هر کسب‌وکار جدا از دیگران نگه‌داری می‌شود و فقط اعضای همان فضای کاری به آن دسترسی دارند." },
  { Icon: Send, title: "ارسال مسئولانه", text: "ارسال فقط از مسیرهای رسمی بله، با احترام به محدودیت‌ها و فهرست عدم ارسال." },
  { Icon: ListChecks, title: "گزارش شفاف", text: "تفکیک «پذیرفته‌شده توسط بله» از «تحویل قطعی»؛ هیچ وضعیتی بدون تأیید ارائه‌دهنده ثبت نمی‌شود." },
  { Icon: ShieldCheck, title: "امنیت از پایه", text: "رمزنگاری Argon2id، نشست امن سمت سرور، محافظت CSRF و گزارش ممیزی." },
];

export default function HomePage() {
  return (
    <>
      <section className="bg-gradient-to-b from-brand-50 to-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:py-24">
          <Badge tone="amber">نسخه آزمایشی — در حال توسعه</Badge>
          <h1 className="mx-auto mt-5 max-w-3xl text-3xl font-extrabold leading-tight text-slate-900 sm:text-5xl sm:leading-tight">
            مخاطبان و کمپین‌های پیام‌رسان بله را یک‌جا مدیریت کنید
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            بله‌کمپین سامانه‌ای برای کسب‌وکارهاست تا مخاطبان خود را سازمان‌دهی کنند و پیام‌های مجاز را از مسیرهای رسمی بله ارسال و پیگیری کنند.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/register" className="rounded-lg bg-brand-600 px-6 py-3 font-medium text-white hover:bg-brand-700">
              ساخت حساب رایگان آزمایشی
            </Link>
            <Link href="/features" className="rounded-lg border border-slate-300 bg-white px-6 py-3 font-medium text-slate-800 hover:bg-slate-50">
              مشاهده امکانات
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {HIGHLIGHTS.map(({ Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <Icon className="size-8 text-brand-600" aria-hidden="true" />
              <h2 className="mt-4 font-bold text-slate-900">{title}</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4">
        <h2 className="text-xl font-bold text-slate-900">وضعیت فعلی محصول</h2>
        <p className="mt-2 text-slate-600">این فهرست دقیقاً نشان می‌دهد کدام بخش‌ها امروز قابل استفاده‌اند.</p>
        <ul className="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {MODULES.map((m) => (
            <li key={m.title} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-slate-900">{m.title}</p>
                <p className="text-sm text-slate-600">{m.description}</p>
              </div>
              <Badge tone={m.status === "available" ? "green" : m.status === "in-progress" ? "amber" : "slate"}>{STATUS_LABEL[m.status]}</Badge>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
