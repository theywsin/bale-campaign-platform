"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createLicensesSchema, type Paginated, type PlanInfo } from "@bcp/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { planPeriod } from "@/components/billing/plan";
import { applyServerErrors } from "@/components/forms";
import { SearchBox } from "@/components/panel/search-box";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";

interface AdminLicense {
  id: string;
  keyPrefix: string;
  plan: { id: string; name: string };
  periodDays: number;
  status: "AVAILABLE" | "REDEEMED" | "REVOKED";
  note: string | null;
  redeemableUntil: string | null;
  redeemedByOrg: { id: string; name: string } | null;
  redeemedAt: string | null;
  createdAt: string;
}
type CreateInput = z.input<typeof createLicensesSchema>;
const STATUS = { AVAILABLE: ["قابل استفاده", "green"], REDEEMED: ["استفاده‌شده", "slate"], REVOKED: ["باطل‌شده", "red"] } as const;
const PAGE_SIZE = 20;

export default function AdminLicensesPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<string[] | null>(null);
  const [toRevoke, setToRevoke] = useState<AdminLicense | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const licenses = useQuery({
    queryKey: ["admin-licenses", q, page],
    queryFn: () => api<Paginated<AdminLicense>>(`/admin/licenses?${new URLSearchParams({ q, page: String(page), pageSize: String(PAGE_SIZE) })}`),
    placeholderData: keepPreviousData,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-licenses"] });
  const revoke = useMutation({
    mutationFn: (l: AdminLicense) => api(`/admin/licenses/${l.id}/revoke`, { method: "POST" }),
    onSuccess: async () => {
      setToRevoke(null);
      setNotice({ tone: "success", text: "کلید باطل شد." });
      await refresh();
    },
    onError: (err) => {
      setToRevoke(null);
      setNotice({ tone: "error", text: errorMessage(err) });
    },
  });

  return (
    <>
      <PageHeader
        title="لایسنس‌ها"
        description="کلید فقط یک بار هنگام ساخت نمایش داده می‌شود و فقط هش آن ذخیره می‌شود."
        actions={
          <div className="flex flex-wrap gap-2">
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="ابتدای کلید یا یادداشت" />
            <Button onClick={() => setCreating(true)}>ساخت کلید</Button>
          </div>
        }
      />
      {notice && <Alert tone={notice.tone} className="mb-4">{notice.text}</Alert>}
      {issued && (
        <Alert tone="warning" className="mb-4" title="این کلیدها را همین حالا ذخیره کنید">
          <p>پس از بستن این پیام دوباره قابل مشاهده نیستند.</p>
          <textarea readOnly aria-label="کلیدهای ساخته‌شده" dir="ltr" className="mt-2 block w-full rounded-lg border border-amber-300 bg-white p-2 font-mono text-sm" rows={Math.min(10, issued.length)} value={issued.join("\n")} />
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => setIssued(null)}>ذخیره کردم، بستن</Button>
        </Alert>
      )}
      <Card>
        {licenses.isPending ? (
          <LoadingBlock />
        ) : licenses.isError ? (
          <Alert tone="error">{errorMessage(licenses.error)}</Alert>
        ) : licenses.data.items.length === 0 ? (
          <EmptyState title="کلیدی یافت نشد" />
        ) : (
          <>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-right text-slate-500">
                    <th scope="col" className="py-2 font-medium">کلید</th>
                    <th scope="col" className="py-2 font-medium">پلن و مدت</th>
                    <th scope="col" className="py-2 font-medium">یادداشت</th>
                    <th scope="col" className="py-2 font-medium">استفاده</th>
                    <th scope="col" className="py-2 font-medium">ساخت</th>
                    <th scope="col" className="py-2 font-medium">وضعیت</th>
                    <th scope="col" className="py-2"><span className="sr-only">عملیات</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {licenses.data.items.map((l) => (
                    <tr key={l.id}>
                      <td className="ltr py-3 text-right font-mono">{l.keyPrefix}…</td>
                      <td className="py-3">{l.plan.name} — {planPeriod(l.periodDays)}</td>
                      <td className="py-3 text-slate-600">{l.note ?? "—"}</td>
                      <td className="py-3 text-slate-600">{l.redeemedByOrg ? `${l.redeemedByOrg.name} — ${formatDate(l.redeemedAt)}` : l.redeemableUntil ? `مهلت تا ${formatDate(l.redeemableUntil)}` : "—"}</td>
                      <td className="py-3 text-slate-600">{formatDate(l.createdAt)}</td>
                      <td className="py-3"><Badge tone={STATUS[l.status][1]}>{STATUS[l.status][0]}</Badge></td>
                      <td className="py-3 text-left">
                        {l.status === "AVAILABLE" && <Button variant="ghost" size="sm" className="text-red-700" onClick={() => setToRevoke(l)}>ابطال</Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={licenses.data.total} onPage={setPage} />
          </>
        )}
      </Card>
      <ConfirmDialog
        open={toRevoke !== null}
        title="ابطال کلید"
        description="کلید باطل‌شده دیگر قابل استفاده نیست. این کار برگشت‌پذیر نیست."
        confirmLabel="ابطال"
        loading={revoke.isPending}
        onCancel={() => setToRevoke(null)}
        onConfirm={() => toRevoke && revoke.mutate(toRevoke)}
      />
      <Dialog open={creating} title="ساخت کلید لایسنس" onClose={() => setCreating(false)}>
        {creating && (
          <CreateForm
            onCancel={() => setCreating(false)}
            onDone={async (keys) => {
              setCreating(false);
              setIssued(keys);
              await refresh();
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function CreateForm({ onDone, onCancel }: { onDone: (keys: string[]) => Promise<void>; onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const plans = useQuery({ queryKey: ["admin-plans"], queryFn: () => api<PlanInfo[]>("/admin/plans") });
  const form = useForm<CreateInput>({ resolver: zodResolver(createLicensesSchema), defaultValues: { planId: "", periodDays: 30, count: 1, note: "", redeemableDays: "" } });
  const e = form.formState.errors;
  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const res = await api<{ keys: string[] }>("/admin/licenses", { method: "POST", body: values });
      await onDone(res.keys);
    } catch (err) {
      setError(applyServerErrors(err, form.setError));
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate aria-label="ساخت کلید لایسنس" className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <label className="block text-sm font-medium text-slate-700">
        پلن
        <select
          className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
          {...form.register("planId", {
            onChange: (ev: React.ChangeEvent<HTMLSelectElement>) => {
              const p = plans.data?.find((x) => x.id === ev.target.value);
              if (p) form.setValue("periodDays", p.periodDays);
            },
          })}
        >
          <option value="">انتخاب کنید</option>
          {plans.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {e.planId && <span className="mt-1.5 block text-sm text-red-600">{e.planId.message}</span>}
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="مدت اشتراک (روز)" type="number" ltr min={1} error={e.periodDays?.message} {...form.register("periodDays")} />
        <Field label="تعداد کلید" type="number" ltr min={1} max={100} error={e.count?.message} {...form.register("count")} />
        <Field label="مهلت استفاده (روز)" type="number" ltr min={1} hint="خالی = بدون مهلت" error={e.redeemableDays?.message} {...form.register("redeemableDays")} />
        <Field label="یادداشت" error={e.note?.message} {...form.register("note")} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>انصراف</Button>
        <Button type="submit" loading={form.formState.isSubmitting}>ساخت</Button>
      </div>
    </form>
  );
}
