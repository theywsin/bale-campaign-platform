"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CONSENT_LABELS_FA,
  createContactSchema,
  orgRoleHasPermission,
  type ContactInfo,
  type CreateContactInput,
  type Paginated,
} from "@bcp/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { applyServerErrors } from "@/components/forms";
import { SearchBox } from "@/components/panel/search-box";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Field, SelectField } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { consentOptions, contactName, displayPhone, useLists } from "@/lib/contacts";
import { formatDate } from "@/lib/format";
import { useOrg } from "@/lib/org";

const PAGE_SIZE = 20;

export default function ContactsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Contacts />
    </Suspense>
  );
}

function Contacts() {
  const { orgId } = useParams<{ orgId: string }>();
  const org = useOrg(orgId);
  const lists = useLists(orgId);
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const initialList = useSearchParams().get("listId") ?? "";
  const [listId, setListId] = useState(initialList);
  const [editing, setEditing] = useState<ContactInfo | "new" | null>(null);
  const [toDelete, setToDelete] = useState<ContactInfo | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), status, ...(q ? { q } : {}), ...(listId ? { listId } : {}) });
  const contacts = useQuery({
    queryKey: ["contacts", orgId, params.toString()],
    queryFn: () => api<Paginated<ContactInfo>>(`/organizations/${orgId}/contacts?${params}`),
    placeholderData: keepPreviousData,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["contacts", orgId] });
  const onSearch = useCallback((v: string) => {
    setQ(v);
    setPage(1);
  }, []);

  const archive = useMutation({
    mutationFn: (c: ContactInfo) => api(`/organizations/${orgId}/contacts/${c.id}/archived`, { method: "PUT", body: { archived: c.status === "ACTIVE" } }),
    onSuccess: async (_d, c) => {
      setNotice({ tone: "success", text: c.status === "ACTIVE" ? "مخاطب بایگانی شد و در کمپین‌های جدید شرکت نمی‌کند." : "مخاطب بازگردانی شد." });
      await refresh();
    },
    onError: (err) => setNotice({ tone: "error", text: errorMessage(err) }),
  });
  const remove = useMutation({
    mutationFn: (c: ContactInfo) => api(`/organizations/${orgId}/contacts/${c.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setToDelete(null);
      setNotice({ tone: "success", text: "مخاطب برای همیشه حذف شد." });
      await refresh();
    },
    onError: (err) => {
      setToDelete(null);
      setNotice({ tone: "error", text: errorMessage(err) });
    },
  });

  const role = org.data?.role;
  const canExport = role ? orgRoleHasPermission(role, "contacts:export") : false;
  const exportHref = `/api/v1/organizations/${orgId}/contacts/export${listId ? `?listId=${listId}` : ""}`;

  return (
    <>
      <PageHeader
        title="مخاطبان"
        description="هر مخاطب برای دریافت پیام از بازوی بله به «شناسه چت» نیاز دارد؛ شماره موبایل برای شناسایی و جلوگیری از تکرار است."
        actions={
          <>
            <Link href={`/app/${orgId}/contacts/import`} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
              <Upload className="size-4" aria-hidden="true" /> ورود از CSV
            </Link>
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" aria-hidden="true" /> مخاطب جدید
            </Button>
          </>
        }
      />
      {notice && <Alert tone={notice.tone} className="mb-4">{notice.text}</Alert>}

      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchBox value={q} onChange={onSearch} placeholder="جستجوی نام، موبایل یا شناسه چت" />
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="status-filter" className="sr-only">وضعیت</label>
            <select id="status-filter" value={status} onChange={(e) => { setStatus(e.target.value as "ACTIVE" | "ARCHIVED"); setPage(1); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="ACTIVE">فعال</option>
              <option value="ARCHIVED">بایگانی‌شده</option>
            </select>
            <label htmlFor="list-filter" className="sr-only">فهرست</label>
            <select id="list-filter" value={listId} onChange={(e) => { setListId(e.target.value); setPage(1); }} className="max-w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="">همه فهرست‌ها</option>
              {lists.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {canExport && (
              <a href={exportHref} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100" download>
                <Download className="size-4" aria-hidden="true" /> خروجی CSV
              </a>
            )}
          </div>
        </div>

        {contacts.isPending ? (
          <LoadingBlock />
        ) : contacts.isError ? (
          <Alert tone="error" className="mt-4">{errorMessage(contacts.error)}</Alert>
        ) : contacts.data.items.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title={q || listId ? "مخاطبی با این شرایط پیدا نشد" : status === "ARCHIVED" ? "مخاطب بایگانی‌شده‌ای وجود ندارد" : "هنوز مخاطبی ثبت نشده است"}
              description={!q && !listId && status === "ACTIVE" ? "مخاطب را دستی اضافه کنید یا فایل CSV وارد کنید." : undefined}
            />
          </div>
        ) : (
          <>
            <div className="relative mt-4 overflow-x-auto">
              <table className="w-full min-w-[48rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-right text-slate-500">
                    <th scope="col" className="py-2 font-medium">نام</th>
                    <th scope="col" className="py-2 font-medium">موبایل</th>
                    <th scope="col" className="py-2 font-medium">شناسه چت بله</th>
                    <th scope="col" className="py-2 font-medium">رضایت</th>
                    <th scope="col" className="py-2 font-medium">تاریخ ثبت</th>
                    <th scope="col" className="py-2"><span className="sr-only">عملیات</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {contacts.data.items.map((c) => (
                    <tr key={c.id}>
                      <td className="py-3 font-medium text-slate-900">{contactName(c)}</td>
                      <td className="ltr py-3 text-right text-slate-600">{displayPhone(c.phone)}</td>
                      <td className="ltr py-3 text-right text-slate-600">{c.baleChatId ?? <span className="text-amber-700">ندارد</span>}</td>
                      <td className="py-3">
                        <Badge tone={c.consent === "OPTED_IN" ? "green" : c.consent === "OPTED_OUT" ? "red" : "slate"}>{CONSENT_LABELS_FA[c.consent]}</Badge>
                      </td>
                      <td className="py-3 text-slate-600">{formatDate(c.createdAt)}</td>
                      <td className="py-3 text-left whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>ویرایش</Button>
                        <Button variant="ghost" size="sm" onClick={() => archive.mutate(c)} disabled={archive.isPending}>
                          {c.status === "ACTIVE" ? "بایگانی" : "بازگردانی"}
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-700" onClick={() => setToDelete(c)}>حذف</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={contacts.data.total} onPage={setPage} />
          </>
        )}
      </Card>

      <Dialog open={editing !== null} title={editing === "new" ? "مخاطب جدید" : "ویرایش مخاطب"} onClose={() => setEditing(null)}>
        {editing !== null && (
          <ContactForm
            orgId={orgId}
            contact={editing === "new" ? null : editing}
            onDone={async (text) => {
              setEditing(null);
              setNotice({ tone: "success", text });
              await refresh();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        title="حذف دائمی مخاطب"
        description="اطلاعات این مخاطب برای همیشه حذف می‌شود و پیام‌های ارسال‌نشده کمپین‌ها به او فرستاده نمی‌شود. اگر فقط نمی‌خواهید در کمپین‌های جدید باشد، «بایگانی» را انتخاب کنید."
        confirmLabel="حذف دائمی"
        loading={remove.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
    </>
  );
}

function ContactForm({ orgId, contact, onDone, onCancel }: { orgId: string; contact: ContactInfo | null; onDone: (msg: string) => Promise<void>; onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<CreateContactInput>({
    resolver: zodResolver(createContactSchema),
    defaultValues: {
      firstName: contact?.firstName ?? "",
      lastName: contact?.lastName ?? "",
      phone: contact?.phone ? displayPhone(contact.phone) : "",
      baleChatId: contact?.baleChatId ?? "",
      notes: contact?.notes ?? "",
      consent: contact?.consent ?? "UNKNOWN",
    },
  });
  const errors = form.formState.errors;
  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      if (contact) await api(`/organizations/${orgId}/contacts/${contact.id}`, { method: "PATCH", body: values });
      else await api(`/organizations/${orgId}/contacts`, { method: "POST", body: values });
      await onDone(contact ? "مخاطب به‌روزرسانی شد." : "مخاطب اضافه شد.");
    } catch (err) {
      setError(applyServerErrors(err, form.setError));
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="نام" error={errors.firstName?.message} {...form.register("firstName")} />
        <Field label="نام خانوادگی" error={errors.lastName?.message} {...form.register("lastName")} />
      </div>
      <Field label="شماره موبایل" ltr inputMode="tel" placeholder="09121234567" error={errors.phone?.message} {...form.register("phone")} />
      <Field
        label="شناسه چت بله"
        ltr
        inputMode="numeric"
        hint="بازو فقط به کاربرانی پیام می‌دهد که آن را شروع کرده‌اند؛ شناسه چت از همان گفتگو به دست می‌آید."
        error={errors.baleChatId?.message}
        {...form.register("baleChatId")}
      />
      <SelectField label="وضعیت رضایت دریافت پیام" options={consentOptions} error={errors.consent?.message} {...form.register("consent")} />
      <Field label="یادداشت" error={errors.notes?.message} {...form.register("notes")} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>انصراف</Button>
        <Button type="submit" loading={form.formState.isSubmitting}>ذخیره</Button>
      </div>
    </form>
  );
}
