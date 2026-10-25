import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmail } from "./verify";

export const metadata: Metadata = { title: "تأیید ایمیل" };

export default function VerifyEmailPage() {
  return (
    <>
      <h1 className="text-xl font-bold text-slate-900">تأیید ایمیل</h1>
      <Suspense>
        <VerifyEmail />
      </Suspense>
    </>
  );
}
