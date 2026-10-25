import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "ورود" };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-xl font-bold text-slate-900">ورود به حساب</h1>
      <p className="mt-1 text-sm text-slate-600">برای ادامه، ایمیل و رمز عبور خود را وارد کنید.</p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
