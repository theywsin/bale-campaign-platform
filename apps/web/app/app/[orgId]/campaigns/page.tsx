"use client";

import type { CampaignInfo, Paginated } from "@bcp/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { CampaignStatusBadge } from "@/components/campaigns/status";
import { SearchBox } from "@/components/panel/search-box";
import { Alert } from "@/components/ui/alert";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";

const PAGE_SIZE = 20;

export default function CampaignsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const onSearch = useCallback((v: string) => {
    setQ(v);
    setPage(1);
  }, []);
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), ...(q ? { q } : {}) });
  const campaigns = useQuery({
    queryKey: ["campaigns", orgId, params.toString()],
    queryFn: () => api<Paginated<CampaignInfo>>(`/organizations/${orgId}/campaigns?${params}`),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => (query.state.data?.items.some((c) => c.status === "QUEUED" || c.status === "RUNNING") ? 5000 : false),
  });

  return (
    <>
      <PageHeader
        title="کمپین‌ها"
        actions={
          <Link href={`/app/${orgId}/campaigns/new`} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
            <Plus className="size-4" aria-hidden="true" /> کمپین جدید
          </Link>
        }
      />
      <Card>
        <SearchBox value={q} onChange={onSearch} placeholder="جستجوی نام کمپین" />
        {campaigns.isPending ? (
          <LoadingBlock />
        ) : campaigns.isError ? (
          <Alert tone="error" className="mt-4">{errorMessage(campaigns.error)}</Alert>
        ) : campaigns.data.items.length === 0 ? (
          <div className="mt-4"><EmptyState title={q ? "کمپینی با این نام پیدا نشد" : "هنوز کمپینی نساخته‌اید"} /></div>
        ) : (
          <>
            <div className="relative mt-4 overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-right text-slate-500">
                    <th scope="col" className="py-2 font-medium">نام</th>
                    <th scope="col" className="py-2 font-medium">وضعیت</th>
                    <th scope="col" className="py-2 font-medium">گیرندگان</th>
                    <th scope="col" className="py-2 font-medium">پذیرفته‌شده</th>
                    <th scope="col" className="py-2 font-medium">ناموفق/نامشخص</th>
                    <th scope="col" className="py-2 font-medium">ایجاد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {campaigns.data.items.map((c) => (
                    <tr key={c.id}>
                      <td className="py-3">
                        <Link href={`/app/${orgId}/campaigns/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.name}</Link>
                      </td>
                      <td className="py-3"><CampaignStatusBadge status={c.status} /></td>
                      <td className="py-3">{formatNumber(c.totalRecipients)}</td>
                      <td className="py-3">{formatNumber(c.counts.ACCEPTED + c.counts.DELIVERED)}</td>
                      <td className="py-3">{formatNumber(c.counts.FAILED)} / {formatNumber(c.counts.UNKNOWN)}</td>
                      <td className="py-3 text-slate-600">{formatDateTime(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={campaigns.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
