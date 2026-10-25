import Link from "next/link";
import { Brand } from "@/components/layout/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-brand-50 to-slate-50">
      <header className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-6">
        <Brand />
        <Link href="/" className="text-sm text-slate-600 hover:text-brand-700">
          بازگشت به صفحه اصلی
        </Link>
      </header>
      <main id="main" className="mx-auto w-full max-w-md flex-1 px-4 pb-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">{children}</div>
      </main>
    </div>
  );
}
