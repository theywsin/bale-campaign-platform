"use client";

import type { OrganizationSummary } from "@bcp/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { ME_KEY, useMe } from "@/lib/session";

export function AcceptInvitation() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const accept = useMutation({
    mutationFn: () => api<OrganizationSummary>("/organizations/invitations/accept", { method: "POST", body: { token } }),
    onSuccess: async (org) => {
      await qc.invalidateQueries({ queryKey: ME_KEY });
      router.replace(`/app/${org.id}`);
    },
  });

  if (!token) return <Alert tone="error" className="mt-6">پیوند دعوت ناقص است.</Alert>;
  if (me.isPending) return <LoadingBlock />;
  const next = encodeURIComponent(`/invitations/accept?token=${token}`);
  if (!me.data) {
    return (
      <div className="mt-6 space-y-4">
        <p className="text-sm leading-7 text-slate-600">برای پذیرش دعوت، با همان ایمیلی که دعوت‌نامه به آن ارسال شده وارد شوید یا حساب جدید بسازید.</p>
        <div className="flex gap-2">
          <Link href={`/login?next=${next}`} className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-brand-700">ورود</Link>
          <Link href={`/register?next=${next}`} className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-center text-sm font-medium hover:bg-slate-50">ثبت‌نام</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-6 space-y-4">
      {accept.isError && <Alert tone="error">{errorMessage(accept.error)}</Alert>}
      <p className="text-sm text-slate-600">
        شما با ایمیل <span className="ltr font-medium">{me.data.user.email}</span> وارد شده‌اید.
      </p>
      <Button className="w-full" loading={accept.isPending} onClick={() => accept.mutate()}>پذیرش دعوت</Button>
    </div>
  );
}
