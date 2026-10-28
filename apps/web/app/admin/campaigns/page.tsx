"use client";

import { CAMPAIGN_STATUS_LABELS_FA, type CampaignStatus, type Paginated } from "@bcp/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CampaignStatusBadge } from "@/components/campaigns/status";
import { SearchBox } from "@/components/panel/search-box";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { TextareaField } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, ApiError, errorMessage } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";

interface AdminCampaign {
  id: string;
  name: string;
  messageText: string;
  status: CampaignStatus;
  failureReason: string | null;
  createdAt: string;
  startedAt: string | null;
  organization: { id: string; name: string };
  messagingAccount: { provider: "BALE_BOT" | "MOCK"; displayName: string } | null;
  totalRecipients: number;
}
const PAGE_SIZE = 20;
const STOPPABLE: CampaignStatus[] = ["DRAFT", "SCHEDULED", "QUEUED", "RUNNING", "PAUSED"];
const STATUS_OPTIONS = [{ value: "", label: "همه وضعیت‌ها" }, ...Object.entries(CAMPAIGN_STATUS_LABELS_FA).map(([value, label]) => ({ value, label }))];

export default function AdminCampaignsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [toStop, setToStop] = useState<AdminCampaign | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const campaigns = useQuery({
    queryKey: ["admin-campaigns", q, status, page],
    queryFn: () => api<Paginated<AdminCampaign>>(`/admin/campaigns?${new URLSearchParams({ q, page: String(page), pageSize: String(PAGE_SIZE), ...(status ? { status } : {}) })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="پایش کمپین‌ها"
        description="کمپین‌های همه فضاهای کاری را با متن پیام بررسی کنید و در صورت نقض قوانین متوقف کنید."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="نام، متن یا فضای کاری" />
            <label htmlFor="status-filter" className="sr-only">فیلتر وضعیت</label>
            <select
              id="status-filter"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:w-44"
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            >
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        }
      />
      {notice && <Alert tone={notice.tone} className="mb-4">{notice.text}</Alert>}
      <Card>
        {campaigns.isPending ? (
          <LoadingBlock />
        ) : campaigns.isError ? (
          <Alert tone="error">{errorMessage(campaigns.error)}</Alert>
        ) : campaigns.data.items.length === 0 ? (
          <EmptyState title="کمپینی یافت نشد" />
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {campaigns.data.items.map((c) => (
                <li key={c.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-900">{c.name}</p>
                      <CampaignStatusBadge status={c.status} />
                      {c.messagingAccount?.provider === "MOCK" && <Badge tone="amber">آزمایشی</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {c.organization.name} · {formatNumber(c.totalRecipients)} گیرنده · ساخت {formatDateTime(c.createdAt)}
                    </p>
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-7 text-slate-700">{c.messageText}</p>
                    {c.failureReason && <p className="mt-2 text-xs text-red-700">{c.failureReason}</p>}
                  </div>
                  {STOPPABLE.includes(c.status) && (
                    <Button variant="danger" size="sm" onClick={() => setToStop(c)}>توقف کمپین</Button>
                  )}
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={campaigns.data.total} onPage={setPage} />
          </>
        )}
      </Card>
      <Dialog open={toStop !== null} title="توقف کمپین توسط مدیریت" onClose={() => setToStop(null)}>
        {toStop && (
          <StopForm
            campaign={toStop}
            onCancel={() => setToStop(null)}
            onDone={async () => {
              setToStop(null);
              setNotice({ tone: "success", text: "کمپین متوقف شد و دلیل آن برای مشتری نمایش داده می‌شود." });
              await qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function StopForm({ campaign, onDone, onCancel }: { campaign: AdminCampaign; onDone: () => Promise<void>; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const stop = useMutation({
    mutationFn: () => api(`/admin/campaigns/${campaign.id}/stop`, { method: "POST", body: { reason } }),
    onSuccess: onDone,
    onError: (err) => setError(err instanceof ApiError && err.fieldErrors?.reason ? err.fieldErrors.reason[0]! : errorMessage(err)),
  });
  return (
    <form
      noValidate
      aria-label="توقف کمپین"
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        stop.mutate();
      }}
    >
      <Alert tone="warning">
        کمپین «{campaign.name}» از {campaign.organization.name} لغو می‌شود و گیرندگان باقی‌مانده پیامی دریافت نمی‌کنند. این کار برگشت‌پذیر نیست.
      </Alert>
      <TextareaField label="دلیل (به مشتری نمایش داده می‌شود)" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} error={error ?? undefined} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>انصراف</Button>
        <Button type="submit" variant="danger" loading={stop.isPending}>توقف کمپین</Button>
      </div>
    </form>
  );
}
