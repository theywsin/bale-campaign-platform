import Link from "next/link";

export default function HomePage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-20 text-center">
      <h1 className="text-3xl font-extrabold text-slate-900">بله‌کمپین</h1>
      <p className="mt-4 text-slate-600">سامانه مدیریت مخاطبان و کمپین‌های پیام‌رسان بله.</p>
      <Link href="/status" className="mt-8 inline-block rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700">
        وضعیت سرویس
      </Link>
    </section>
  );
}
