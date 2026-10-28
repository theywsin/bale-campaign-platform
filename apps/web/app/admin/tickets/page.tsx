"use client";

import { TICKET_STATUS_LABELS, type Paginated, type TicketSummary } from "@bcp/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { categoryLabel, TicketPriorityBadge, TicketStatusBadge } from "@/components/support/ticket";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 25;
const FILTERS = [{ value: "OPEN", label: TICKET_STATUS_LABELS.OPEN }, { value: "ANSWERED", label: TICKET_STATUS_LABELS.ANSWERED }, { value: "CLOSED", label: TICKET_STATUS_LABELS.CLOSED }, { value: "", label: "همه" }];

export default function AdminTicketsPage() {
  const [status, setStatus] = useState("OPEN");
  const [page, setPage] = useState(1);
  const tickets = useQuery({
    queryKey: ["admin-tickets", status, page],
    queryFn: () => api<Paginated<TicketSummary>>(`/admin/tickets?${new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), ...(status ? { status } : {}) })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  return (
    <>
      <PageHeader title="تیکت‌ها" description="تیکت‌های همه فضاهای کاری؛ تازه‌ترین گفت‌وگو بالاتر است." />
      <Card>
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="فیلتر وضعیت">
          {FILTERS.map((f) => (
            <Button key={f.value} size="sm" variant={status === f.value ? "primary" : "secondary"} aria-pressed={status === f.value} onClick={() => { setStatus(f.value); setPage(1); }}>
              {f.label}
            </Button>
          ))}
        </div>
        {tickets.isPending ? (
          <LoadingBlock />
        ) : tickets.isError ? (
          <Alert tone="error">{errorMessage(tickets.error)}</Alert>
        ) : tickets.data.items.length === 0 ? (
          <EmptyState title="تیکتی در این صف نیست" />
        ) : (
          <>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[46rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-right text-slate-500">
                    <th scope="col" className="py-2 font-medium">موضوع</th>
                    <th scope="col" className="py-2 font-medium">فضای کاری</th>
                    <th scope="col" className="py-2 font-medium">اولویت</th>
                    <th scope="col" className="py-2 font-medium">آخرین پیام</th>
                    <th scope="col" className="py-2 font-medium">وضعیت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tickets.data.items.map((t) => (
                    <tr key={t.id}>
                      <td className="py-3">
                        <Link href={`/admin/tickets/${t.id}`} className="font-medium text-brand-700 hover:underline">{t.subject}</Link>
                        <p className="text-xs text-slate-500">{categoryLabel(t.category)} · {t.messageCount} پیام</p>
                      </td>
                      <td className="py-3 text-slate-600">{t.organization.name}</td>
                      <td className="py-3"><TicketPriorityBadge priority={t.priority} /></td>
                      <td className="py-3 text-slate-600">{formatDateTime(t.lastMessageAt)}</td>
                      <td className="py-3"><TicketStatusBadge status={t.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={tickets.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
