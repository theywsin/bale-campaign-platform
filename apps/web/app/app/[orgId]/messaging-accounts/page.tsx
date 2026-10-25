"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createMockAccountSchema, orgRoleHasPermission, type CreateMockAccountInput, type MessagingAccountInfo } from "@bcp/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { applyServerErrors } from "@/components/forms";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import { useOrg } from "@/lib/org";
import { accountsKey } from "@/lib/contacts";

export default function MessagingAccountsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const org = useOrg(orgId);
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [toDelete, setToDelete] = useState<MessagingAccountInfo | null>(null);
  const accounts = useQuery({
    queryKey: accountsKey(orgId),
    queryFn: () => api<{ mockEnabled: boolean; items: MessagingAccountInfo[] }>(`/organizations/${orgId}/messaging-accounts`),
  });
  const canWrite = org.data ? orgRoleHasPermission(org.data.role, "messaging-accounts:write") : false;
  const refresh = () => qc.invalidateQueries({ queryKey: accountsKey(orgId) });

  const toggle = useMutation({
    mutationFn: (a: MessagingAccountInfo) =>
      api(`/organizations/${orgId}/messaging-accounts/${a.id}/status`, { method: "PUT", body: { status: a.status === "ACTIVE" ? "DISABLED" : "ACTIVE" } }),
    onSuccess: refresh,
    onError: (err) => setNotice({ tone: "error", text: errorMessage(err) }),
  });
  const remove = useMutation({
    mutationFn: (a: MessagingAccountInfo) => api(`/organizations/${orgId}/messaging-accounts/${a.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setToDelete(null);
      setNotice({ tone: "success", text: "حساب حذف شد." });
      await refresh();
    },
    onError: (err) => {
      setToDelete(null);
      setNotice({ tone: "error", text: errorMessage(err) });
    },
  });

  if (accounts.isPending || org.isPending) return <LoadingBlock />;
  if (accounts.isError) return <Alert tone="error">{errorMessage(accounts.error)}</Alert>;

  return (
    <>
      <PageHeader title="حساب‌های پیام‌رسان" description="حسابی که کمپین‌ها از طریق آن ارسال می‌شوند." />
      {notice && <Alert tone={notice.tone} className="mb-4">{notice.text}</Alert>}
      <Alert tone="info" className="mb-6" title="اتصال بازوی بله">
        اتصال به بله فقط از طریق API رسمی بازو (Bot API) انجام می‌شود و در مرحله بعدی توسعه فعال خواهد شد. بازو فقط به کاربرانی پیام می‌دهد که آن را شروع کرده‌اند و
        رسید تحویل ارائه نمی‌دهد؛ بنابراین گزارش‌ها «پذیرفته‌شده توسط سرویس» را نشان می‌دهند، نه «تحویل‌شده».
      </Alert>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          {accounts.data.items.length === 0 ? (
            <EmptyState title="هنوز حسابی ثبت نشده است" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {accounts.data.items.map((a) => (
                <li key={a.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                      {a.displayName}
                      {a.isTestOnly && <Badge tone="amber">آزمایشی — پیام واقعی ارسال نمی‌شود</Badge>}
                      <Badge tone={a.status === "ACTIVE" ? "green" : "slate"}>{a.status === "ACTIVE" ? "فعال" : "غیرفعال"}</Badge>
                    </p>
                    <p className="text-xs text-slate-500">
                      سقف {formatNumber(a.rateLimitPerMinute)} پیام در دقیقه — ثبت در {formatDate(a.createdAt)}
                    </p>
                  </div>
                  {canWrite && (
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="sm" onClick={() => toggle.mutate(a)} disabled={toggle.isPending}>
                        {a.status === "ACTIVE" ? "غیرفعال‌کردن" : "فعال‌کردن"}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-700" onClick={() => setToDelete(a)}>حذف</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        {canWrite && (
          <Card>
            <h2 className="font-bold text-slate-900">حساب آزمایشی (Mock)</h2>
            {accounts.data.mockEnabled ? (
              <MockForm orgId={orgId} onDone={async () => { setNotice({ tone: "success", text: "حساب آزمایشی ساخته شد." }); await refresh(); }} />
            ) : (
              <p className="mt-2 text-sm text-slate-600">حساب آزمایشی در این استقرار غیرفعال است.</p>
            )}
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        title="حذف حساب"
        description="کمپین‌های پیش‌نویسی که از این حساب استفاده می‌کنند بدون حساب ارسال می‌مانند."
        confirmLabel="حذف حساب"
        loading={remove.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
    </>
  );
}

function MockForm({ orgId, onDone }: { orgId: string; onDone: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<CreateMockAccountInput>({ resolver: zodResolver(createMockAccountSchema), defaultValues: { displayName: "حساب آزمایشی", rateLimitPerMinute: 60 } });
  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api(`/organizations/${orgId}/messaging-accounts/mock`, { method: "POST", body: values });
      form.reset();
      await onDone();
    } catch (err) {
      setError(applyServerErrors(err, form.setError));
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate className="mt-3 space-y-4">
      <p className="text-sm leading-7 text-slate-600">
        برای آزمودن روند کمپین بدون ارسال واقعی. نتیجه بر اساس رقم‌های پایانی شناسه چت شبیه‌سازی می‌شود: <span className="ltr inline-block">…991</span> رد،
        <span className="ltr inline-block"> …992</span> خطای موقت، <span className="ltr inline-block">…993</span> نامشخص و بقیه پذیرفته.
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="نام حساب" error={form.formState.errors.displayName?.message} {...form.register("displayName")} />
      <Field label="سقف پیام در دقیقه" type="number" ltr min={1} max={600} error={form.formState.errors.rateLimitPerMinute?.message} {...form.register("rateLimitPerMinute")} />
      <Button type="submit" loading={form.formState.isSubmitting}>ساخت حساب آزمایشی</Button>
    </form>
  );
}
