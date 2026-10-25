"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createContactListSchema, type ContactListInfo, type CreateContactListInput } from "@bcp/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { applyServerErrors } from "@/components/forms";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { listsKey, useLists } from "@/lib/contacts";
import { formatDate, formatNumber } from "@/lib/format";

export default function ListsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const lists = useLists(orgId);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ContactListInfo | "new" | null>(null);
  const [toDelete, setToDelete] = useState<ContactListInfo | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const remove = useMutation({
    mutationFn: (l: ContactListInfo) => api(`/organizations/${orgId}/lists/${l.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setToDelete(null);
      setNotice({ tone: "success", text: "فهرست حذف شد. مخاطبان آن حذف نمی‌شوند." });
      await qc.invalidateQueries({ queryKey: listsKey(orgId) });
    },
    onError: (err) => {
      setToDelete(null);
      setNotice({ tone: "error", text: errorMessage(err) });
    },
  });

  return (
    <>
      <PageHeader
        title="فهرست‌های مخاطبان"
        description="مخاطبان را برای هدف‌گیری کمپین‌ها گروه‌بندی کنید. هر مخاطب می‌تواند در چند فهرست باشد."
        actions={<Button onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden="true" /> فهرست جدید</Button>}
      />
      {notice && <Alert tone={notice.tone} className="mb-4">{notice.text}</Alert>}
      <Card>
        {lists.isPending ? (
          <LoadingBlock />
        ) : lists.isError ? (
          <Alert tone="error">{errorMessage(lists.error)}</Alert>
        ) : lists.data.length === 0 ? (
          <EmptyState title="هنوز فهرستی ندارید" description="یک فهرست بسازید و هنگام ورود CSV مخاطبان را به آن اضافه کنید." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {lists.data.map((l) => (
              <li key={l.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{l.name}</p>
                  <p className="text-xs text-slate-500">
                    {formatNumber(l.contactCount)} مخاطب — ساخته‌شده در {formatDate(l.createdAt)}
                    {l.description ? ` — ${l.description}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Link href={`/app/${orgId}/contacts?listId=${l.id}`} className="rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">مخاطبان</Link>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(l)}>ویرایش</Button>
                  <Button variant="ghost" size="sm" className="text-red-700" onClick={() => setToDelete(l)}>حذف</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={editing !== null} title={editing === "new" ? "فهرست جدید" : "ویرایش فهرست"} onClose={() => setEditing(null)}>
        {editing !== null && (
          <ListForm
            orgId={orgId}
            list={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onDone={async () => {
              setEditing(null);
              setNotice({ tone: "success", text: "فهرست ذخیره شد." });
              await qc.invalidateQueries({ queryKey: listsKey(orgId) });
            }}
          />
        )}
      </Dialog>
      <ConfirmDialog
        open={toDelete !== null}
        title="حذف فهرست"
        description={`فهرست «${toDelete?.name ?? ""}» حذف می‌شود. خود مخاطبان باقی می‌مانند.`}
        confirmLabel="حذف فهرست"
        loading={remove.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
    </>
  );
}

function ListForm({ orgId, list, onDone, onCancel }: { orgId: string; list: ContactListInfo | null; onDone: () => Promise<void>; onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<CreateContactListInput>({
    resolver: zodResolver(createContactListSchema),
    defaultValues: { name: list?.name ?? "", description: list?.description ?? "" },
  });
  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api(list ? `/organizations/${orgId}/lists/${list.id}` : `/organizations/${orgId}/lists`, { method: list ? "PATCH" : "POST", body: values });
      await onDone();
    } catch (err) {
      setError(applyServerErrors(err, form.setError));
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="نام فهرست" error={form.formState.errors.name?.message} {...form.register("name")} />
      <Field label="توضیح (اختیاری)" error={form.formState.errors.description?.message} {...form.register("description")} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>انصراف</Button>
        <Button type="submit" loading={form.formState.isSubmitting}>ذخیره</Button>
      </div>
    </form>
  );
}
