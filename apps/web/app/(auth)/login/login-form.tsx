"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, mfaLoginSchema, type LoginInput, type LoginResponse, type MeResponse } from "@bcp/shared";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { applyServerErrors } from "@/components/forms";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";
import { ME_KEY, safeNext } from "@/lib/session";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const finish = (me: MeResponse) => {
    qc.setQueryData(ME_KEY, me);
    router.replace(safeNext(params.get("next")));
  };
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const res = await api<LoginResponse>("/auth/login", { method: "POST", body: values });
      if ("mfaRequired" in res) setMfaToken(res.mfaToken);
      else finish(res);
    } catch (err) {
      setError(applyServerErrors(err, form.setError));
    }
  });

  const { errors, isSubmitting } = form.formState;
  if (mfaToken) {
    return (
      <MfaStep
        mfaToken={mfaToken}
        onDone={finish}
        onExpired={(msg) => {
          setMfaToken(null);
          setError(msg);
        }}
      />
    );
  }
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

function MfaStep({ mfaToken, onDone, onExpired }: { mfaToken: string; onDone: (me: MeResponse) => void; onExpired: (msg: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);
  const form = useForm<{ mfaToken: string; code: string }>({ resolver: zodResolver(mfaLoginSchema), defaultValues: { mfaToken, code: "" } });
  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      onDone(await api<MeResponse>("/auth/login/mfa", { method: "POST", body: values }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onExpired(err.message);
      else setError(applyServerErrors(err, form.setError));
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate aria-label="ورود دومرحله‌ای" className="mt-6 space-y-4">
      <Alert tone="info" title="ورود دومرحله‌ای">
        {recovery ? "یکی از کدهای بازیابی خود را وارد کنید. هر کد فقط یک بار کار می‌کند." : "کد ۶ رقمی برنامه احراز هویت (مثل Google Authenticator) را وارد کنید."}
      </Alert>
      {error && <Alert tone="error">{error}</Alert>}
      <Field
        label={recovery ? "کد بازیابی" : "کد تأیید"}
        ltr
        autoFocus
        autoComplete="one-time-code"
        inputMode={recovery ? "text" : "numeric"}
        placeholder={recovery ? "XXXXX-XXXXX" : "123456"}
        error={form.formState.errors.code?.message}
        {...form.register("code")}
      />
      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        تأیید و ورود
      </Button>
      <button type="button" className="block w-full text-center text-sm text-brand-700 hover:underline" onClick={() => setRecovery((r) => !r)}>
        {recovery ? "استفاده از کد برنامه احراز هویت" : "به برنامه دسترسی ندارم؛ استفاده از کد بازیابی"}
      </button>
    </form>
  );
}
