"use client";

import { formatRials, type Paginated } from "@bcp/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { ORDER_STATUS } from "@/components/billing/plan";
import { SearchBox } from "@/components/panel/search-box";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

interface AdminOrder {
  id: string;
  organization: { id: string; name: string };
  plan: { id: string; name: string };
  amountRials: string;
  status: keyof typeof ORDER_STATUS;
  paidAt: string | null;
  createdAt: string;
  payments: {
    id: string;
    provider: "MOCK";
    providerRef: string;
    status: "INITIATED" | "SUCCEEDED" | "FAILED" | "CANCELED";
    failureCode: string | null;
    createdAt: string;
    history: { from: string | null; to: string; reason: string | null; at: string }[];
  }[];
}

const PAYMENT_STATUS: Record<string, string> = { INITIATED: "آغازشده", SUCCEEDED: "موفق", FAILED: "ناموفق", CANCELED: "لغوشده" };
const PROVIDER: Record<string, string> = { MOCK: "درگاه آزمایشی" };
const PAGE_SIZE = 20;

export default function AdminPaymentsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const orders = useQuery({
    queryKey: ["admin-orders", q, status, page],
    queryFn: () => api<Paginated<AdminOrder>>(`/admin/orders?${new URLSearchParams({ q, status, page: String(page), pageSize: String(PAGE_SIZE) })}`),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        title="سفارش‌ها و پرداخت‌ها"
        actions={
          <div className="flex flex-wrap gap-2">
            <select aria-label="وضعیت سفارش" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">همه وضعیت‌ها</option>
              {Object.entries(ORDER_STATUS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="نام یا شناسه سازمان" />
          </div>
        }
      />
      <Card>
        {orders.isPending ? (
          <LoadingBlock />
        ) : orders.isError ? (
          <Alert tone="error">{errorMessage(orders.error)}</Alert>
        ) : orders.data.items.length === 0 ? (
          <EmptyState title="سفارشی یافت نشد" />
        ) : (
          <>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[48rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-right text-slate-500">
                    <th scope="col" className="py-2 font-medium">سازمان</th>
                    <th scope="col" className="py-2 font-medium">پلن</th>
                    <th scope="col" className="py-2 font-medium">مبلغ</th>
                    <th scope="col" className="py-2 font-medium">ثبت</th>
                    <th scope="col" className="py-2 font-medium">وضعیت</th>
                    <th scope="col" className="py-2"><span className="sr-only">جزئیات</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.data.items.map((o) => (
                    <Fragment key={o.id}>
                      <tr>
                        <td className="py-3 font-medium text-slate-900">{o.organization.name}</td>
                        <td className="py-3">{o.plan.name}</td>
                        <td className="py-3">{formatRials(o.amountRials)}</td>
                        <td className="py-3 text-slate-600">{formatDateTime(o.createdAt)}</td>
                        <td className="py-3"><Badge tone={ORDER_STATUS[o.status][1]}>{ORDER_STATUS[o.status][0]}</Badge></td>
                        <td className="py-3 text-left">
                          {o.payments.length > 0 && (
                            <Button variant="ghost" size="sm" aria-expanded={open === o.id} onClick={() => setOpen(open === o.id ? null : o.id)}>
                              {open === o.id ? "بستن" : "تاریخچه پرداخت"}
                            </Button>
                          )}
                        </td>
                      </tr>
                      {open === o.id && (
                        <tr>
                          <td colSpan={6} className="bg-slate-50 p-3">
                            {o.payments.map((p) => (
                              <div key={p.id} className="mb-2 last:mb-0">
                                <p className="font-medium text-slate-800">
                                  {PROVIDER[p.provider]} — مرجع <span className="ltr inline-block font-mono">{p.providerRef}</span> — {PAYMENT_STATUS[p.status]}
                                  {p.failureCode ? ` (${p.failureCode})` : ""}
                                </p>
                                <ol className="mt-1 list-inside list-decimal text-slate-600">
                                  {p.history.map((h, i) => (
                                    <li key={i}>
                                      {formatDateTime(h.at)}: {h.from ? `${PAYMENT_STATUS[h.from]} ← ` : ""}{PAYMENT_STATUS[h.to]}
                                      {h.reason ? <span className="ltr inline-block text-xs"> {h.reason}</span> : null}
                                    </li>
                                  ))}
                                </ol>
                              </div>
                            ))}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={orders.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
