"use client";

import type { Paginated } from "@bcp/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SearchBox } from "@/components/panel/search-box";
import { Alert } from "@/components/ui/alert";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { actionLabel, formatDateTime } from "@/lib/format";

interface AuditRow {
  id: string;
  category: string;
  action: string;
  actorEmail: string | null;
  organizationId: string | null;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

const CATEGORIES = [
  { value: "", label: "همه دسته‌ها" },
  { value: "SECURITY", label: "امنیتی" },
  { value: "ORGANIZATION", label: "سازمانی" },
  { value: "ADMIN", label: "مدیریتی" },
  { value: "BILLING", label: "مالی" },
  { value: "CAMPAIGN", label: "کمپین" },
];
const PAGE_SIZE = 30;

export default function AuditLogsPage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const logs = useQuery({
    queryKey: ["admin-audit", q, category, page],
    queryFn: () => {
      const params = new URLSearchParams({ q, page: String(page), pageSize: String(PAGE_SIZE) });
      if (category) params.set("category", category);
      return api<Paginated<AuditRow>>(`/admin/audit-logs?${params}`);
    },
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="گزارش ممیزی"
        description="رویدادهای حساس امنیتی، سازمانی و مدیریتی. این گزارش قابل ویرایش نیست."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="category" className="sr-only">دسته</label>
            <select id="category" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجوی کد رویداد" />
          </div>
        }
      />
      <Card>
        {logs.isPending ? (
          <LoadingBlock />
        ) : logs.isError ? (
          <Alert tone="error">{errorMessage(logs.error)}</Alert>
        ) : logs.data.items.length === 0 ? (
          <EmptyState title="رویدادی یافت نشد" />
        ) : (
          <>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-right text-slate-500">
                    <th scope="col" className="py-2 font-medium">زمان</th>
                    <th scope="col" className="py-2 font-medium">رویداد</th>
                    <th scope="col" className="py-2 font-medium">دسته</th>
                    <th scope="col" className="py-2 font-medium">انجام‌دهنده</th>
                    <th scope="col" className="py-2 font-medium">هدف</th>
                    <th scope="col" className="py-2 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.data.items.map((l) => (
                    <tr key={l.id}>
                      <td className="py-3 text-slate-600">{formatDateTime(l.createdAt)}</td>
                      <td className="py-3">
                        <p className="font-medium text-slate-900">{actionLabel(l.action)}</p>
                        <p className="ltr text-right text-xs text-slate-400">{l.action}</p>
                      </td>
                      <td className="py-3"><Badge>{CATEGORIES.find((c) => c.value === l.category)?.label ?? l.category}</Badge></td>
                      <td className="ltr py-3 text-right text-slate-600">{l.actorEmail ?? "—"}</td>
                      <td className="py-3 text-xs text-slate-500">{l.targetType ? <span className="ltr">{l.targetType}:{l.targetId?.slice(0, 8)}</span> : "—"}</td>
                      <td className="ltr py-3 text-right text-slate-600">{l.ipAddress ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={logs.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
