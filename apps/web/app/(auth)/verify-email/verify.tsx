"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { ME_KEY } from "@/lib/session";

/** Verification is an explicit button press, so link scanners in mail clients cannot consume the token. */
export function VerifyEmail() {
  const token = useSearchParams().get("token") ?? "";
  const qc = useQueryClient();
  const verify = useMutation({
    mutationFn: () => api("/auth/email/verify", { method: "POST", body: { token } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ME_KEY }),
  });

  if (!token) return <Alert tone="error" className="mt-6">پیوند تأیید ناقص است.</Alert>;
  if (verify.isSuccess) {
    return (
      <div className="mt-6 space-y-4">
        <Alert tone="success">ایمیل شما تأیید شد.</Alert>
        <Link href="/app" className="block rounded-lg bg-brand-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-brand-700">ورود به پنل</Link>
      </div>
    );
  }
  return (
    <div className="mt-6 space-y-4">
      {verify.isError && <Alert tone="error">{errorMessage(verify.error)}</Alert>}
      <p className="text-sm text-slate-600">برای تأیید نشانی ایمیل حساب خود، دکمه زیر را بزنید.</p>
      <Button className="w-full" loading={verify.isPending} onClick={() => verify.mutate()}>تأیید ایمیل</Button>
    </div>
  );
}
