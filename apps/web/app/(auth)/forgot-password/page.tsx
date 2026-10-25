"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@bcp/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { applyServerErrors } from "@/components/forms";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const caps = useQuery({ queryKey: ["auth-capabilities"], queryFn: () => api<{ emailDelivery: boolean }>("/auth/capabilities") });
  const form = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const res = await api<{ message: string }>("/auth/password/forgot", { method: "POST", body: values });
      setDone(res.message);
    } catch (err) {
      setError(applyServerErrors(err, form.setError));
    }
  });

  return (
    <>
      <h1 className="text-xl font-bold text-slate-900">بازیابی رمز عبور</h1>
      <p className="mt-1 text-sm text-slate-600">ایمیل حساب خود را وارد کنید تا پیوند تعیین رمز جدید برایتان ارسال شود.</p>
      {caps.data && !caps.data.emailDelivery && (
        <Alert tone="warning" className="mt-4">
          ارسال ایمیل در این نصب از سامانه پیکربندی نشده است و پیوند بازیابی ارسال نخواهد شد. با مدیر سامانه تماس بگیرید.
        </Alert>
      )}
      {done ? (
        <Alert tone="success" className="mt-6">{done}</Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="ایمیل" type="email" autoComplete="email" ltr error={form.formState.errors.email?.message} {...form.register("email")} />
          <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
            ارسال پیوند بازیابی
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-brand-700 hover:underline">بازگشت به ورود</Link>
      </p>
    </>
  );
}
