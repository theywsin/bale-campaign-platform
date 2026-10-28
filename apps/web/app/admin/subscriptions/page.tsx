"use client";

import { platformRoleHasPermission, type Paginated, type PlanInfo, type SubscriptionInfo } from "@bcp/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SUBSCRIPTION_SOURCE, SUBSCRIPTION_STATUS } from "@/components/billing/plan";
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
import { useMe } from "@/lib/session";

type AdminSubscription = SubscriptionInfo & { organization: { id: string; name: string; slug: string } };
interface AdminOrg { id: string; name: string; slug: string }
const PAGE_SIZE = 20;

export default function AdminSubscriptionsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [toCancel, setToCancel] = useState<AdminSubscription | null>(null);
  const [granting, setGranting] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const canWrite = platformRoleHasPermission(me.data?.user.platformRole, "admin:subscriptions:write");
  const subs = useQuery({
    queryKey: ["admin-subscriptions", q, status, page],
    queryFn: () => api<Paginated<AdminSubscription>>(`/admin/subscriptions?${new URLSearchParams({ q, status, page: String(page), pageSize: String(PAGE_SIZE) })}`),
    placeholderData: keepPreviousData,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
  const cancel = useMutation({
    mutationFn: (s: AdminSubscription) => api(`/admin/subscriptions/${s.id}/cancel`, { method: "POST" }),
    onSuccess: async () => {
      setToCancel(null);
      setNotice({ tone: "success", text: "اشتراک لغو شد." });
      await refresh();
    },
    onError: (err) => {
      setToCancel(null);
      setNotice({ tone: "error", text: errorMessage(err) });
    },
  });

  return (
    <>
      <PageHeader
        title="اشتراک‌ها"
        actions={
          <div className="flex flex-wrap gap-2">
            <select aria-label="وضعیت" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">همه وضعیت‌ها</option>
              <option value="ACTIVE">فعال</option>
              <option value="EXPIRED">منقضی</option>
              <option value="CANCELED">لغوشده</option>
            </select>
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="نام یا شناسه سازمان" />
            {canWrite && <Button onClick={() => setGranting(true)}>اعطای اشتراک</Button>}
          </div>
        }
      />
      {notice && <Alert tone={notice.tone} className="mb-4">{notice.text}</Alert>}
      <Card>
        {subs.isPending ? (
          <LoadingBlock />
        ) : subs.isError ? (
          <Alert tone="error">{errorMessage(subs.error)}</Alert>
        ) : subs.data.items.length === 0 ? (
          <EmptyState title="اشتراکی یافت نشد" />
        ) : (
          <>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[48rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-right text-slate-500">
                    <th scope="col" className="py-2 font-medium">سازمان</th>
                    <th scope="col" className="py-2 font-medium">پلن</th>
                    <th scope="col" className="py-2 font-medium">منبع</th>
                    <th scope="col" className="py-2 font-medium">آغاز</th>
                    <th scope="col" className="py-2 font-medium">پایان</th>
                    <th scope="col" className="py-2 font-medium">وضعیت</th>
                    <th scope="col" className="py-2"><span className="sr-only">عملیات</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {subs.data.items.map((s) => (
                    <tr key={s.id}>
                      <td className="py-3 font-medium text-slate-900">{s.organization.name}</td>
                      <td className="py-3">{s.plan.name}</td>
                      <td className="py-3 text-slate-600">{SUBSCRIPTION_SOURCE[s.source]}</td>
                      <td className="py-3 text-slate-600">{formatDate(s.startsAt)}</td>
                      <td className="py-3 text-slate-600">{formatDate(s.endsAt)}</td>
                      <td className="py-3"><Badge tone={SUBSCRIPTION_STATUS[s.status][1]}>{SUBSCRIPTION_STATUS[s.status][0]}</Badge></td>
                      <td className="py-3 text-left">
                        {canWrite && s.status === "ACTIVE" && <Button variant="ghost" size="sm" className="text-red-700" onClick={() => setToCancel(s)}>لغو</Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={subs.data.total} onPage={setPage} />
          </>
        )}
      </Card>
      <ConfirmDialog
        open={toCancel !== null}
        title="لغو اشتراک"
        description="اشتراک بلافاصله پایان می‌یابد و محدودیت‌های پلن پایه (در صورت تعریف) اعمال می‌شود. مبلغی بازگردانده نمی‌شود؛ بازپرداخت را جداگانه انجام دهید."
        confirmLabel="لغو اشتراک"
        loading={cancel.isPending}
        onCancel={() => setToCancel(null)}
        onConfirm={() => toCancel && cancel.mutate(toCancel)}
      />
      <Dialog open={granting} title="اعطای اشتراک" onClose={() => setGranting(false)}>
        {granting && (
          <GrantForm
            onCancel={() => setGranting(false)}
            onDone={async () => {
              setGranting(false);
              setNotice({ tone: "success", text: "اشتراک اعطا شد." });
              await refresh();
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function GrantForm({ onDone, onCancel }: { onDone: () => Promise<void>; onCancel: () => void }) {
  const [orgQuery, setOrgQuery] = useState("");
  const [orgId, setOrgId] = useState("");
  const [planId, setPlanId] = useState("");
  const [periodDays, setPeriodDays] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const orgs = useQuery({
    queryKey: ["admin-orgs-pick", orgQuery],
    queryFn: () => api<Paginated<AdminOrg>>(`/admin/organizations?${new URLSearchParams({ q: orgQuery, pageSize: "10" })}`),
  });
  const plans = useQuery({ queryKey: ["admin-plans"], queryFn: () => api<PlanInfo[]>("/admin/plans") });
  const grant = useMutation({
    mutationFn: () => api(`/admin/organizations/${orgId}/subscription`, { method: "POST", body: { planId, periodDays } }),
    onSuccess: onDone,
    onError: (err) => setError(errorMessage(err)),
  });
  return (
    <form
      aria-label="اعطای اشتراک"
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!orgId || !planId) return setError("سازمان و پلن را انتخاب کنید.");
        grant.mutate();
      }}
    >
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="جست‌وجوی سازمان" value={orgQuery} onChange={(e) => setOrgQuery(e.target.value)} />
      <label className="block text-sm font-medium text-slate-700">
        سازمان
        <select className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
          <option value="">انتخاب کنید</option>
          {orgs.data?.items.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.slug})</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-700">
        پلن
        <select
          className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
          value={planId}
          onChange={(e) => {
            setPlanId(e.target.value);
            const p = plans.data?.find((x) => x.id === e.target.value);
            if (p) setPeriodDays(String(p.periodDays));
          }}
        >
          <option value="">انتخاب کنید</option>
          {plans.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <Field label="مدت (روز)" type="number" ltr min={1} max={3660} value={periodDays} onChange={(e) => setPeriodDays(e.target.value)} hint="اگر همین پلن فعال باشد، مدت به انتهای آن افزوده می‌شود." />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>انصراف</Button>
        <Button type="submit" loading={grant.isPending}>اعطا</Button>
      </div>
    </form>
  );
}
