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
import { formatDate, formatNumber } from "@/lib/format";

interface AdminOrg {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  createdAt: string;
  ownerEmail: string | null;
  memberCount: number;
}

const STATUS = { ACTIVE: ["فعال", "green"], SUSPENDED: ["تعلیق‌شده", "red"], ARCHIVED: ["بایگانی‌شده", "slate"] } as const;
const PAGE_SIZE = 20;

export default function AdminOrganizationsPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const orgs = useQuery({
    queryKey: ["admin-orgs", q, page],
    queryFn: () => api<Paginated<AdminOrg>>(`/admin/organizations?${new URLSearchParams({ q, page: String(page), pageSize: String(PAGE_SIZE) })}`),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader title="سازمان‌ها" description="فضاهای کاری مشتریان." actions={<SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجوی نام یا شناسه" />} />
      <Card>
        {orgs.isPending ? (
          <LoadingBlock />
        ) : orgs.isError ? (
          <Alert tone="error">{errorMessage(orgs.error)}</Alert>
        ) : orgs.data.items.length === 0 ? (
          <EmptyState title={q ? "سازمانی با این مشخصات یافت نشد" : "هنوز سازمانی ساخته نشده است"} />
        ) : (
          <>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-right text-slate-500">
                    <th scope="col" className="py-2 font-medium">نام</th>
                    <th scope="col" className="py-2 font-medium">شناسه</th>
                    <th scope="col" className="py-2 font-medium">سازنده</th>
                    <th scope="col" className="py-2 font-medium">اعضا</th>
                    <th scope="col" className="py-2 font-medium">ایجاد</th>
                    <th scope="col" className="py-2 font-medium">وضعیت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orgs.data.items.map((o) => (
                    <tr key={o.id}>
                      <td className="py-3 font-medium text-slate-900">{o.name}</td>
                      <td className="ltr py-3 text-right text-slate-600">{o.slug}</td>
                      <td className="ltr py-3 text-right text-slate-600">{o.ownerEmail ?? "—"}</td>
                      <td className="py-3">{formatNumber(o.memberCount)}</td>
                      <td className="py-3 text-slate-600">{formatDate(o.createdAt)}</td>
                      <td className="py-3"><Badge tone={STATUS[o.status][1]}>{STATUS[o.status][0]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={orgs.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
