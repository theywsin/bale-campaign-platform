"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  changePasswordSchema,
  PASSWORD_MIN_LENGTH,
  updateProfileSchema,
  type ChangePasswordInput,
  type MeResponse,
  type SessionInfo,
  type UpdateProfileInput,
} from "@bcp/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { applyServerErrors } from "@/components/forms";
import { Alert } from "@/components/ui/alert";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { ME_KEY, useMe } from "@/lib/session";

function describeAgent(ua: string | null): string {
  if (!ua) return "دستگاه نامشخص";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "مرورگر";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} روی ${os}` : browser;
}

export default function AccountPage() {
  const me = useMe();
  if (me.isPending || !me.data) return <LoadingBlock />;
  return (
    <>
      <PageHeader title="پروفایل و امنیت" />
      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileCard me={me.data} />
        <PasswordCard />
      </div>
      <SessionsCard />
    </>
  );
}

function ProfileCard({ me }: { me: MeResponse }) {
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const form = useForm<UpdateProfileInput>({ resolver: zodResolver(updateProfileSchema), defaultValues: { fullName: me.user.fullName } });
  useEffect(() => form.reset({ fullName: me.user.fullName }), [me.user.fullName, form]);
  const resend = useMutation({
    mutationFn: () => api("/auth/email/resend", { method: "POST" }),
    onSuccess: () => setNotice({ tone: "success", text: "پیوند تأیید دوباره ارسال شد. صندوق ایمیل خود را بررسی کنید." }),
    onError: (err) => setNotice({ tone: "error", text: errorMessage(err) }),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setNotice(null);
    try {
      const updated = await api<MeResponse>("/users/me", { method: "PATCH", body: values });
      qc.setQueryData(ME_KEY, updated);
      setNotice({ tone: "success", text: "پروفایل ذخیره شد." });
    } catch (err) {
      setNotice({ tone: "error", text: applyServerErrors(err, form.setError) });
    }
  });

  return (
    <Card>
      <h2 className="font-bold text-slate-900">اطلاعات حساب</h2>
      <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
        <Field label="نام و نام خانوادگی" error={form.formState.errors.fullName?.message} {...form.register("fullName")} />
        <div>
          <Field label="ایمیل" value={me.user.email} readOnly ltr />
          <div className="mt-2 flex items-center gap-3 text-sm">
            {me.user.emailVerified ? (
              <Badge tone="green">تأییدشده</Badge>
            ) : (
              <>
                <Badge tone="amber">تأییدنشده</Badge>
                <Button variant="ghost" size="sm" loading={resend.isPending} onClick={() => resend.mutate()}>
                  ارسال دوباره پیوند تأیید
                </Button>
              </>
            )}
          </div>
        </div>
        <Button type="submit" loading={form.formState.isSubmitting}>ذخیره</Button>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const form = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema), defaultValues: { currentPassword: "", newPassword: "" } });
  const onSubmit = form.handleSubmit(async (values) => {
    setNotice(null);
    try {
      await api("/users/me/password", { method: "POST", body: values });
      form.reset();
      await qc.invalidateQueries({ queryKey: ["sessions"] });
      setNotice({ tone: "success", text: "رمز عبور تغییر کرد. سایر نشست‌ها بسته شدند." });
    } catch (err) {
      setNotice({ tone: "error", text: applyServerErrors(err, form.setError) });
    }
  });
  return (
    <Card>
      <h2 className="font-bold text-slate-900">تغییر رمز عبور</h2>
      <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
        <Field label="رمز فعلی" type="password" autoComplete="current-password" ltr error={form.formState.errors.currentPassword?.message} {...form.register("currentPassword")} />
        <Field label="رمز جدید" type="password" autoComplete="new-password" ltr hint={`حداقل ${PASSWORD_MIN_LENGTH.toLocaleString("fa-IR")} کاراکتر، شامل حرف و عدد.`} error={form.formState.errors.newPassword?.message} {...form.register("newPassword")} />
        <Button type="submit" loading={form.formState.isSubmitting}>تغییر رمز</Button>
      </form>
    </Card>
  );
}

function SessionsCard() {
  const qc = useQueryClient();
  const [confirmOthers, setConfirmOthers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => api<SessionInfo[]>("/users/me/sessions") });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/users/me/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
    onError: (err) => setError(errorMessage(err)),
  });
  const revokeOthers = useMutation({
    mutationFn: () => api<{ revoked: number }>("/users/me/sessions/revoke-others", { method: "POST" }),
    onSuccess: async () => {
      setConfirmOthers(false);
      await qc.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (err) => {
      setConfirmOthers(false);
      setError(errorMessage(err));
    },
  });

  return (
    <Card className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-bold text-slate-900">نشست‌های فعال</h2>
          <p className="mt-1 text-sm text-slate-600">اگر دستگاهی را نمی‌شناسید، نشست آن را ببندید و رمز خود را تغییر دهید.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setConfirmOthers(true)} disabled={(sessions.data?.length ?? 0) <= 1}>
          بستن سایر نشست‌ها
        </Button>
      </div>
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}
      {sessions.isPending ? (
        <LoadingBlock />
      ) : sessions.isError ? (
        <Alert tone="error" className="mt-4">{errorMessage(sessions.error)}</Alert>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {sessions.data.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-slate-900">
                  {describeAgent(s.userAgent)} {s.current && <Badge tone="brand">این دستگاه</Badge>}
                </p>
                <p className="text-xs text-slate-500">
                  <span className="ltr">{s.ipAddress ?? "—"}</span> — آخرین فعالیت: {formatDateTime(s.lastSeenAt)}
                </p>
              </div>
              {!s.current && (
                <Button variant="ghost" size="sm" className="self-start text-red-700 sm:self-auto" loading={revoke.isPending && revoke.variables === s.id} onClick={() => revoke.mutate(s.id)}>
                  بستن نشست
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={confirmOthers}
        title="بستن سایر نشست‌ها"
        description="همه دستگاه‌های دیگر از حساب شما خارج می‌شوند. این دستگاه وارد باقی می‌ماند."
        confirmLabel="بستن نشست‌ها"
        loading={revokeOthers.isPending}
        onCancel={() => setConfirmOthers(false)}
        onConfirm={() => revokeOthers.mutate()}
      />
    </Card>
  );
}
