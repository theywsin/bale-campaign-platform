"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-xl font-bold text-slate-900">خطایی رخ داد</h1>
      <p className="mt-2 text-slate-600">مشکلی در نمایش این صفحه پیش آمد. لطفاً دوباره تلاش کنید.</p>
      <button onClick={reset} className="mt-6 rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700">تلاش دوباره</button>
    </main>
  );
}
