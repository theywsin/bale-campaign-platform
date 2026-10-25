import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "تعیین رمز جدید" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-xl font-bold text-slate-900">تعیین رمز جدید</h1>
      <Suspense>
        <ResetForm />
      </Suspense>
    </>
  );
}
