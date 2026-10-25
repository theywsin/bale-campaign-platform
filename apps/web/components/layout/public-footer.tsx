import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="mt-20 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <p>© بله‌کمپین — نسخه آزمایشی</p>
        <nav className="flex flex-wrap gap-4" aria-label="پیوندهای پایین صفحه">
          <Link href="/terms" className="hover:text-brand-700">شرایط استفاده</Link>
          <Link href="/privacy" className="hover:text-brand-700">حریم خصوصی</Link>
          <Link href="/status" className="hover:text-brand-700">وضعیت سرویس</Link>
          <Link href="/faq" className="hover:text-brand-700">پرسش‌های متداول</Link>
        </nav>
      </div>
    </footer>
  );
}
