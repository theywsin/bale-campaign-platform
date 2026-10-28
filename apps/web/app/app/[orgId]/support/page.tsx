"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  createTicketSchema,
  type CreateTicketInput,
  type Paginated,
  type PublicSettings,
  type TicketDetail,
  type TicketSummary,
} from "@bcp/shared";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { applyServerErrors } from "@/components/forms";
import { categoryLabel, TicketStatusBadge } from "@/components/support/ticket";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 20;
const STATUS_FILTERS = [{ value: "", label: "همه" }, ...Object.entries(TICKET_STATUS_LABELS).map(([value, label]) => ({ value, label }))];

export default function SupportPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const tickets = useQuery({
    queryKey: ["tickets", orgId, status, page],
    queryFn: () =>
      api<Paginated<TicketSummary>>(
        `/organizations/${orgId}/tickets?${new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), ...(status ? { status } : {}) })}`,
      ),
    placeholderData: keepPreviousData,
  });
  const settings = useQuery({ queryKey: ["public-settings"], queryFn: () => api<PublicSettings>("/settings") });

  return (
    <>
      <PageHeader
        title="تیکت پشتیبانی"
        description="سؤال یا مشکل خود را ثبت کنید؛ پاسخ پشتیبانی همین‌جا نمایش داده می‌شود."
        actions={<Button onClick={() => setCreating(true)}>تیکت جدید</Button>}
      />
      {settings.data?.supportEmail && (
        <p className="mb-4 text-sm text-slate-600">
          نشانی ایمیل پشتیبانی:{" "}
          <a className="ltr inline-block text-brand-700 hover:underline" href={`mailto:${settings.data.supportEmail}`}>{settings.data.supportEmail}</a>
        </p>
      )}
      <Card>
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="فیلتر وضعیت">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={status === f.value ? "primary" : "secondary"}
              aria-pressed={status === f.value}
              onClick={() => {
                setStatus(f.value);
                setPage(1);
              }}
            >
              {f.label}
            </Button>
          ))}
        </div>
        {tickets.isPending ? (
          <LoadingBlock />
        ) : tickets.isError ? (
          <Alert tone="error">{errorMessage(tickets.error)}</Alert>
        ) : tickets.data.items.length === 0 ? (
          <EmptyState
            title={status ? "تیکتی با این وضعیت ندارید" : "هنوز تیکتی ثبت نکرده‌اید"}
            description="برای پرسش درباره ارسال، اشتراک یا حساب کاربری یک تیکت ثبت کنید."
            action={<Button onClick={() => setCreating(true)}>ثبت تیکت</Button>}
          />
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {tickets.data.items.map((t) => (
                <li key={t.id}>
                  <Link href={`/app/${orgId}/support/${t.id}`} className="flex flex-col gap-1 rounded-lg px-2 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{t.subject}</p>
                      <p className="text-xs text-slate-500">
                        {categoryLabel(t.category)} · {t.messageCount} پیام · آخرین پیام {formatDateTime(t.lastMessageAt)}
                      </p>
                    </div>
                    <TicketStatusBadge status={t.status} />
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={tickets.data.total} onPage={setPage} />
          </>
        )}
      </Card>
      <Dialog open={creating} title="ثبت تیکت جدید" onClose={() => setCreating(false)}>
        {creating && (
          <CreateTicketForm
            orgId={orgId}
            onCancel={() => setCreating(false)}
            onCreated={async (t) => {
              setCreating(false);
              await qc.invalidateQueries({ queryKey: ["tickets", orgId] });
              router.push(`/app/${orgId}/support/${t.id}`);
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function CreateTicketForm({ orgId, onCreated, onCancel }: { orgId: string; onCreated: (t: TicketDetail) => Promise<void>; onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<CreateTicketInput>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: { subject: "", category: "TECHNICAL", priority: "NORMAL", body: "" },
  });
  const e = form.formState.errors;
  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await onCreated(await api<TicketDetail>(`/organizations/${orgId}/tickets`, { method: "POST", body: values }));
    } catch (err) {
      setError(applyServerErrors(err, form.setError));
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate aria-label="ثبت تیکت" className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="موضوع" error={e.subject?.message} {...form.register("subject")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="دسته" error={e.category?.message} options={TICKET_CATEGORIES.map((c) => ({ value: c, label: TICKET_CATEGORY_LABELS[c] }))} {...form.register("category")} />
        <SelectField label="اولویت" error={e.priority?.message} options={TICKET_PRIORITIES.map((p) => ({ value: p, label: TICKET_PRIORITY_LABELS[p] }))} {...form.register("priority")} />
      </div>
      <TextareaField
        label="شرح"
        rows={6}
        hint="هرگز رمز عبور یا توکن بازو را در تیکت ننویسید."
        error={e.body?.message}
        {...form.register("body")}
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>انصراف</Button>
        <Button type="submit" loading={form.formState.isSubmitting}>ثبت تیکت</Button>
      </div>
    </form>
  );
}
