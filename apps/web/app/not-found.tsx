import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-5xl font-extrabold text-brand-600">۴۰۴</p>
      <h1 className="mt-4 text-xl font-bold text-slate-900">صفحه یافت نشد</h1>
      <p className="mt-2 text-slate-600">نشانی وارد‌شده وجود ندارد یا جابه‌جا شده است.</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700">بازگشت به صفحه اصلی</Link>
    </main>
  );
}
