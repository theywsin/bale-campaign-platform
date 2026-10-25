"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput, type MeResponse } from "@bcp/shared";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { applyServerErrors } from "@/components/forms";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { api } from "@/lib/api";
import { ME_KEY, safeNext } from "@/lib/session";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const me = await api<MeResponse>("/auth/login", { method: "POST", body: values });
      qc.setQueryData(ME_KEY, me);
      router.replace(safeNext(params.get("next")));
    } catch (err) {
      setError(applyServerErrors(err, form.setError));
    }
  });

  const { errors, isSubmitting } = form.formState;
  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="ایمیل" type="email" autoComplete="email" ltr error={errors.email?.message} {...form.register("email")} />
      <Field label="رمز عبور" type="password" autoComplete="current-password" ltr error={errors.password?.message} {...form.register("password")} />
      <div className="flex justify-end text-sm">
        <Link href="/forgot-password" className="text-brand-700 hover:underline">
          رمز عبور را فراموش کرده‌اید؟
        </Link>
      </div>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        ورود
      </Button>
      <p className="text-center text-sm text-slate-600">
        حساب ندارید؟{" "}
        <Link href={`/register${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`} className="font-medium text-brand-700 hover:underline">
          ثبت‌نام کنید
        </Link>
      </p>
    </form>
  );
}
