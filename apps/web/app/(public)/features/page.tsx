import type { Metadata } from "next";
import { MODULES, STATUS_LABEL } from "@/lib/roadmap";
import { Badge } from "@/components/ui/card";

export const metadata: Metadata = { title: "امکانات" };

export default function FeaturesPage() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-2xl font-bold sm:text-3xl">امکانات بله‌کمپین</h1>
      <p className="mt-3 leading-8 text-slate-600">
        بله‌کمپین مرحله‌به‌مرحله ساخته می‌شود. امکاناتی که «فعال» هستند هم‌اکنون در پنل قابل استفاده‌اند؛ سایر موارد پس از تکمیل و تست منتشر می‌شوند.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {MODULES.map((m) => (
          <article key={m.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-bold text-slate-900">{m.title}</h2>
              <Badge tone={m.status === "available" ? "green" : m.status === "in-progress" ? "amber" : "slate"}>{STATUS_LABEL[m.status]}</Badge>
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-600">{m.description}</p>
          </article>
        ))}
      </div>
      <div className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm leading-7 text-amber-900">
        <h2 className="font-bold">درباره اتصال به بله</h2>
        <p className="mt-2">
          ارسال پیام فقط از طریق API رسمی بازوی بله انجام خواهد شد. طبق مستندات رسمی، این API رسید تحویل یا خوانده‌شدن ارائه نمی‌دهد؛ بنابراین گزارش‌ها وضعیت
          «پذیرفته‌شده توسط بله» را نشان می‌دهند، نه تحویل قطعی. اتصال حساب شخصی از طریق روش‌های غیررسمی پشتیبانی نمی‌شود.
        </p>
      </div>
    </section>
  );
}
