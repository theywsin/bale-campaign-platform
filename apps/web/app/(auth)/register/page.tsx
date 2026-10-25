import type { Metadata } from "next";
import { Suspense } from "react";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "ثبت‌نام" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-xl font-bold text-slate-900">ساخت حساب جدید</h1>
      <p className="mt-1 text-sm text-slate-600">یک فضای کاری برای کسب‌وکار شما ساخته می‌شود و شما مالک آن خواهید بود.</p>
      <Suspense>
        <RegisterForm />
      </Suspense>
    </>
  );
}
