"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PASSWORD_MIN_LENGTH, registerSchema, type MeResponse } from "@bcp/shared";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { applyServerErrors } from "@/components/forms";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { api } from "@/lib/api";
import { ME_KEY, safeNext } from "@/lib/session";

type FormInput = z.input<typeof registerSchema>;

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", email: "", password: "", organizationName: "", acceptTerms: false as unknown as true },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const me = await api<MeResponse>("/auth/register", { method: "POST", body: values });
      qc.setQueryData(ME_KEY, me);
      const next = params.get("next");
      router.replace(next ? safeNext(next) : `/app/${me.organizations[0]?.id ?? ""}?welcome=1`);
    } catch (err) {
      setError(applyServerErrors(err, form.setError));
    }
  });

  const { errors, isSubmitting } = form.formState;
  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="نام و نام خانوادگی" autoComplete="name" error={errors.fullName?.message} {...form.register("fullName")} />
      <Field label="ایمیل" type="email" autoComplete="email" ltr error={errors.email?.message} {...form.register("email")} />
      <Field
        label="رمز عبور"
        type="password"
        autoComplete="new-password"
        ltr
        hint={`حداقل ${PASSWORD_MIN_LENGTH.toLocaleString("fa-IR")} کاراکتر، شامل حرف و عدد.`}
        error={errors.password?.message}
        {...form.register("password")}
      />
      <Field label="نام کسب‌وکار یا فضای کاری" autoComplete="organization" error={errors.organizationName?.message} {...form.register("organizationName")} />
      <div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-1 size-4 rounded border-slate-300 text-brand-600" {...form.register("acceptTerms")} />
          <span>
            <Link href="/terms" target="_blank" className="text-brand-700 hover:underline">شرایط استفاده</Link> و{" "}
            <Link href="/privacy" target="_blank" className="text-brand-700 hover:underline">سیاست حریم خصوصی</Link> را خوانده‌ام و می‌پذیرم.
          </span>
        </label>
        {errors.acceptTerms && <p className="mt-1.5 text-sm text-red-600">{errors.acceptTerms.message}</p>}
      </div>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        ساخت حساب
      </Button>
      <p className="text-center text-sm text-slate-600">
        حساب دارید؟{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          وارد شوید
        </Link>
      </p>
    </form>
  );
}
