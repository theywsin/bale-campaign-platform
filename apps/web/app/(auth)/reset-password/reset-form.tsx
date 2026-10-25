"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { passwordSchema, PASSWORD_MIN_LENGTH } from "@bcp/shared";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { applyServerErrors } from "@/components/forms";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { api } from "@/lib/api";

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "تکرار رمز با رمز جدید یکسان نیست.", path: ["confirm"] });

export function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { password: "", confirm: "" } });

  if (!token) return <Alert tone="error" className="mt-6">پیوند بازیابی ناقص است. لطفاً دوباره از صفحه «فراموشی رمز» درخواست دهید.</Alert>;
  if (done) {
    return (
      <div className="mt-6 space-y-4">
        <Alert tone="success">رمز عبور تغییر کرد و همه نشست‌های قبلی بسته شدند. اکنون با رمز جدید وارد شوید.</Alert>
        <Link href="/login" className="block rounded-lg bg-brand-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-brand-700">ورود</Link>
      </div>
    );
  }

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setError(null);
    try {
      await api("/auth/password/reset", { method: "POST", body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(applyServerErrors(err, form.setError));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="رمز جدید" type="password" autoComplete="new-password" ltr hint={`حداقل ${PASSWORD_MIN_LENGTH.toLocaleString("fa-IR")} کاراکتر، شامل حرف و عدد.`} error={form.formState.errors.password?.message} {...form.register("password")} />
      <Field label="تکرار رمز جدید" type="password" autoComplete="new-password" ltr error={form.formState.errors.confirm?.message} {...form.register("confirm")} />
      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>ذخیره رمز جدید</Button>
    </form>
  );
}
