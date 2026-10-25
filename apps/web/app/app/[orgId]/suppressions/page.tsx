"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createSuppressionSchema, type CreateSuppressionInput, type Paginated, type SuppressionInfo } from "@bcp/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { applyServerErrors } from "@/components/forms";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { displayPhone } from "@/lib/contacts";
import { formatDate } from "@/lib/format";

const PAGE_SIZE = 20;

export default function SuppressionsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const items = useQuery({
    queryKey: ["suppressions", orgId, page],
    queryFn: () => api<Paginated<SuppressionInfo>>(`/organizations/${orgId}/suppressions?page=${page}&pageSize=${PAGE_SIZE}`),
    placeholderData: keepPreviousData,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["suppressions", orgId] });

  const remove = useMutation({
    mutationFn: (s: SuppressionInfo) => api(`/organizations/${orgId}/suppressions/${s.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setNotice({ tone: "success", text: "از فهرست عدم ارسال حذف شد." });
      await refresh();
    },
    onError: (err) => setNotice({ tone: "error", text: errorMessage(err) }),
  });

  const [error, setError] = useState<string | null>(null);
  const form = useForm<CreateSuppressionInput>({ resolver: zodResolver(createSuppressionSchema), defaultValues: { phone: "", baleChatId: "", reason: "" } });
  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api(`/organizations/${orgId}/suppressions`, { method: "POST", body: values });
      form.reset();
      setNotice({ tone: "success", text: "به فهرست عدم ارسال اضافه شد." });
      await refresh();
    } catch (err) {
      setError(applyServerErrors(err, form.setError));
    }
  });

  return (
    <>
      <PageHeader title="فهرست عدم ارسال" description="به این شماره‌ها و شناسه‌ها هیچ پیام کمپینی ارسال نمی‌شود؛ حتی اگر در فهرست مخاطبان باشند. این کنترل هنگام شروع کمپین و دوباره پیش از هر ارسال انجام می‌شود." />
      {notice && <Alert tone={notice.tone} className="mb-4">{notice.text}</Alert>}
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          {items.isPending ? (
            <LoadingBlock />
          ) : items.isError ? (
            <Alert tone="error">{errorMessage(items.error)}</Alert>
          ) : items.data.items.length === 0 ? (
            <EmptyState title="فهرست عدم ارسال خالی است" />
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {items.data.items.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="ltr text-right font-medium text-slate-900">{s.kind === "PHONE" ? displayPhone(s.value) : s.value}</p>
                      <p className="text-xs text-slate-500">
                        {s.kind === "PHONE" ? "موبایل" : "شناسه چت بله"} — {formatDate(s.createdAt)}
                        {s.reason ? ` — ${s.reason}` : ""}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-red-700" onClick={() => remove.mutate(s)} disabled={remove.isPending}>حذف</Button>
                  </li>
                ))}
              </ul>
              <Pagination page={page} pageSize={PAGE_SIZE} total={items.data.total} onPage={setPage} />
            </>
          )}
        </Card>
        <Card>
          <h2 className="font-bold text-slate-900">افزودن</h2>
          <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <Field label="شماره موبایل" ltr inputMode="tel" error={form.formState.errors.phone?.message} {...form.register("phone")} />
            <p className="text-center text-xs text-slate-500">یا</p>
            <Field label="شناسه چت بله" ltr inputMode="numeric" error={form.formState.errors.baleChatId?.message} {...form.register("baleChatId")} />
            <Field label="علت (اختیاری)" error={form.formState.errors.reason?.message} {...form.register("reason")} />
            <Button type="submit" loading={form.formState.isSubmitting}>افزودن به فهرست</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
