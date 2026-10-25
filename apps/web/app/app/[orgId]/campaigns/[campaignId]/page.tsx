"use client";

import {
  orgRoleHasPermission,
  RECIPIENT_STATUS_LABELS_FA,
  RECIPIENT_STATUSES,
  type CampaignInfo,
  type CampaignRecipientInfo,
  type Paginated,
  type RecipientStatus,
} from "@bcp/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import { CampaignStatusBadge, RecipientStatusBadge } from "@/components/campaigns/status";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pagination } from "@/components/ui/pagination";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useOrg } from "@/lib/org";

const PAGE_SIZE = 25;
type Action = "start" | "pause" | "resume" | "cancel" | "delete";

export default function CampaignDetailPage() {
  const { orgId, campaignId } = useParams<{ orgId: string; campaignId: string }>();
  const org = useOrg(orgId);
  const qc = useQueryClient();
  const router = useRouter();
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [scheduleAt, setScheduleAt] = useState("");
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<RecipientStatus | "">("");

  const base = `/organizations/${orgId}/campaigns/${campaignId}`;
  const live = (s?: string) => s === "QUEUED" || s === "RUNNING";
  const campaign = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: () => api<CampaignInfo>(base),
    refetchInterval: (q) => (live(q.state.data?.status) ? 3000 : false),
  });
  const rParams = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), ...(filter ? { status: filter } : {}) });
  // Status and counts in the key: the table refreshes whenever the summary changes (including the final poll).
  const progressKey = campaign.data ? `${campaign.data.status}:${Object.values(campaign.data.counts).join(",")}` : "";
  const recipients = useQuery({
    queryKey: ["campaign-recipients", campaignId, rParams.toString(), progressKey],
    queryFn: () => api<Paginated<CampaignRecipientInfo>>(`${base}/recipients?${rParams}`),
    enabled: campaign.data !== undefined && campaign.data.status !== "DRAFT",
    placeholderData: keepPreviousData,
  });

  const act = useMutation({
    mutationFn: async (action: Action) => {
      if (action === "delete") return api(base, { method: "DELETE" });
      const body = action === "start" && scheduleAt ? { scheduledAt: new Date(scheduleAt).toISOString() } : undefined;
      return api<CampaignInfo>(`${base}/${action}`, { method: "POST", body: action === "start" ? (body ?? {}) : undefined });
    },
    onSuccess: async (_d, action) => {
      setConfirm(null);
      if (action === "delete") {
        await qc.invalidateQueries({ queryKey: ["campaigns", orgId] });
        router.replace(`/app/${orgId}/campaigns`);
        return;
      }
      const messages: Record<Exclude<Action, "delete">, string> = {
        start: scheduleAt ? "کمپین زمان‌بندی شد." : "کمپین در صف ارسال قرار گرفت.",
        pause: "کمپین متوقف شد. پیام‌های ارسال‌نشده تا ادامه کمپین ارسال نمی‌شوند.",
        resume: "کمپین دوباره در صف ارسال قرار گرفت.",
        cancel: "کمپین لغو شد.",
      };
      setNotice({ tone: "success", text: messages[action] });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["campaign", campaignId] }),
        qc.invalidateQueries({ queryKey: ["campaign-recipients", campaignId] }),
        qc.invalidateQueries({ queryKey: ["campaigns", orgId] }),
      ]);
    },
    onError: (err) => {
      setConfirm(null);
      setNotice({ tone: "error", text: errorMessage(err) });
    },
  });

  if (campaign.isPending || org.isPending) return <LoadingBlock />;
  if (campaign.isError) return <Alert tone="error">{errorMessage(campaign.error)}</Alert>;
  const c = campaign.data;
  const canSend = org.data ? orgRoleHasPermission(org.data.role, "campaigns:send") : false;
  const canWrite = org.data ? orgRoleHasPermission(org.data.role, "campaigns:write") : false;
  const done = c.counts.ACCEPTED + c.counts.DELIVERED + c.counts.FAILED + c.counts.UNKNOWN + c.counts.SUPPRESSED;
  const progress = c.totalRecipients ? Math.round((done / c.totalRecipients) * 100) : 0;

  const confirmText: Record<Action, { title: string; description: string; label: string; tone: "danger" | "primary" }> = {
    start: {
      title: scheduleAt ? "زمان‌بندی کمپین" : "شروع ارسال",
      description: scheduleAt
        ? `کمپین در ${formatDateTime(new Date(scheduleAt).toISOString())} ارسال می‌شود. فهرست گیرندگان همین حالا ثبت می‌شود.`
        : "گیرندگان همین حالا ثبت می‌شوند و ارسال آغاز می‌شود. پس از شروع، متن پیام قابل ویرایش نیست.",
      label: scheduleAt ? "زمان‌بندی" : "شروع ارسال",
      tone: "primary",
    },
    pause: { title: "توقف کمپین", description: "ارسال پیام‌های باقی‌مانده متوقف می‌شود و بعداً می‌توانید ادامه دهید.", label: "توقف", tone: "primary" },
    resume: { title: "ادامه کمپین", description: "ارسال پیام‌های باقی‌مانده از سر گرفته می‌شود.", label: "ادامه", tone: "primary" },
    cancel: { title: "لغو کمپین", description: "پیام‌های ارسال‌نشده هرگز ارسال نمی‌شوند. این کار برگشت‌پذیر نیست.", label: "لغو کمپین", tone: "danger" },
    delete: { title: "حذف پیش‌نویس", description: "این پیش‌نویس برای همیشه حذف می‌شود.", label: "حذف", tone: "danger" },
  };

  return (
    <>
      <nav aria-label="مسیر" className="mb-2 text-sm">
        <Link href={`/app/${orgId}/campaigns`} className="text-brand-700 hover:underline">کمپین‌ها</Link>
      </nav>
      <PageHeader
        title={c.name}
        description={`حساب ارسال: ${c.messagingAccount?.displayName ?? "حذف‌شده"}${c.messagingAccount?.provider === "MOCK" ? " (آزمایشی — پیام واقعی ارسال نمی‌شود)" : ""} — گیرندگان: ${c.list?.name ?? "همه مخاطبان فعال"}`}
        actions={<CampaignStatusBadge status={c.status} />}
      />
      {notice && <Alert tone={notice.tone} className="mb-4">{notice.text}</Alert>}
      {c.status === "FAILED" && c.failureReason && <Alert tone="error" className="mb-4" title="کمپین متوقف شد">{c.failureReason}</Alert>}

      {c.status === "DRAFT" ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <Card>
            <h2 className="mb-4 font-bold text-slate-900">ویرایش پیش‌نویس</h2>
            {canWrite ? (
              <CampaignForm
                orgId={orgId}
                campaign={c}
                onSaved={async () => {
                  setNotice({ tone: "success", text: "تغییرات ذخیره شد." });
                  await qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
                }}
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{c.messageText}</p>
            )}
          </Card>
          <Card>
            <h2 className="font-bold text-slate-900">ارسال</h2>
            {canSend ? (
              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="schedule-at" className="mb-1.5 block text-sm font-medium text-slate-700">زمان ارسال (اختیاری)</label>
                  <input
                    id="schedule-at"
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value)}
                    dir="ltr"
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  />
                  <p className="mt-1.5 text-xs text-slate-500">خالی بگذارید تا بلافاصله ارسال شود. زمان بر اساس ساعت دستگاه شماست.</p>
                </div>
                <Button className="w-full" onClick={() => setConfirm("start")}>{scheduleAt ? "زمان‌بندی" : "شروع ارسال"}</Button>
                {canWrite && <Button variant="ghost" className="w-full text-red-700" onClick={() => setConfirm("delete")}>حذف پیش‌نویس</Button>}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">شروع کمپین فقط برای مالک یا مدیر فضای کاری مجاز است.</p>
            )}
          </Card>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="کل گیرندگان" value={formatNumber(c.totalRecipients)} hint={`پیشرفت ${formatNumber(progress)}٪`} />
            <StatCard label="پذیرفته‌شده توسط سرویس" value={formatNumber(c.counts.ACCEPTED + c.counts.DELIVERED)} hint="به معنی تحویل قطعی نیست" />
            <StatCard label="ناموفق" value={formatNumber(c.counts.FAILED)} hint={`مستثنا: ${formatNumber(c.counts.SUPPRESSED)}`} />
            <StatCard label="نامشخص" value={formatNumber(c.counts.UNKNOWN)} hint="خودکار دوباره ارسال نمی‌شود" />
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="پیشرفت ارسال">
            <div className="h-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
            <Card>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="font-bold text-slate-900">گزارش گیرندگان</h2>
                <div>
                  <label htmlFor="recipient-filter" className="sr-only">فیلتر وضعیت</label>
                  <select
                    id="recipient-filter"
                    value={filter}
                    onChange={(e) => { setFilter(e.target.value as RecipientStatus | ""); setPage(1); }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">همه وضعیت‌ها</option>
                    {RECIPIENT_STATUSES.map((s) => <option key={s} value={s}>{RECIPIENT_STATUS_LABELS_FA[s]} ({formatNumber(c.counts[s])})</option>)}
                  </select>
                </div>
              </div>
              {recipients.isPending ? (
                <LoadingBlock />
              ) : recipients.isError ? (
                <Alert tone="error" className="mt-4">{errorMessage(recipients.error)}</Alert>
              ) : recipients.data.items.length === 0 ? (
                <div className="mt-4"><EmptyState title="گیرنده‌ای با این وضعیت وجود ندارد" /></div>
              ) : (
                <>
                  <div className="relative mt-4 overflow-x-auto">
                    <table className="w-full min-w-[40rem] text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-right text-slate-500">
                          <th scope="col" className="py-2 font-medium">مخاطب</th>
                          <th scope="col" className="py-2 font-medium">شناسه چت</th>
                          <th scope="col" className="py-2 font-medium">وضعیت</th>
                          <th scope="col" className="py-2 font-medium">تلاش</th>
                          <th scope="col" className="py-2 font-medium">توضیح</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {recipients.data.items.map((r) => (
                          <tr key={r.id}>
                            <td className="py-3">{r.contactName ?? (r.contactId ? "بدون نام" : "مخاطب حذف‌شده")}</td>
                            <td className="ltr py-3 text-right text-slate-600">{r.chatId ?? "—"}</td>
                            <td className="py-3"><RecipientStatusBadge status={r.status} /></td>
                            <td className="py-3">{formatNumber(r.attemptCount)}</td>
                            <td className="py-3 text-xs text-slate-600">{r.lastErrorMessage ?? (r.acceptedAt ? formatDateTime(r.acceptedAt) : "—")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination page={page} pageSize={PAGE_SIZE} total={recipients.data.total} onPage={setPage} />
                </>
              )}
            </Card>
            <div className="space-y-6">
              <Card>
                <h2 className="font-bold text-slate-900">جزئیات</h2>
                <dl className="mt-3 space-y-2 text-sm">
                  {c.scheduledAt && <div className="flex justify-between gap-2"><dt className="text-slate-500">زمان‌بندی</dt><dd>{formatDateTime(c.scheduledAt)}</dd></div>}
                  <div className="flex justify-between gap-2"><dt className="text-slate-500">شروع</dt><dd>{formatDateTime(c.startedAt)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-slate-500">پایان</dt><dd>{formatDateTime(c.finishedAt)}</dd></div>
                </dl>
                {canSend && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {["SCHEDULED", "QUEUED", "RUNNING"].includes(c.status) && <Button variant="secondary" onClick={() => setConfirm("pause")}>توقف</Button>}
                    {c.status === "PAUSED" && <Button onClick={() => setConfirm("resume")}>ادامه</Button>}
                    {["SCHEDULED", "QUEUED", "RUNNING", "PAUSED"].includes(c.status) && (
                      <Button variant="ghost" className="text-red-700" onClick={() => setConfirm("cancel")}>لغو</Button>
                    )}
                  </div>
                )}
              </Card>
              <Card>
                <h2 className="font-bold text-slate-900">متن پیام</h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700" dir="auto">{c.messageText}</p>
              </Card>
              <Card>
                <h2 className="font-bold text-slate-900">معنای وضعیت‌ها</h2>
                <ul className="mt-3 space-y-2 text-xs leading-6 text-slate-600">
                  <li><b>پذیرفته‌شده:</b> سرویس پیام‌رسان پیام را پذیرفت. بله رسید تحویل ارائه نمی‌دهد.</li>
                  <li><b>نامشخص:</b> پاسخی از سرویس نرسید و ممکن است پیام ارسال شده باشد؛ برای جلوگیری از پیام تکراری دوباره ارسال نمی‌شود.</li>
                  <li><b>مستثنا:</b> در فهرست عدم ارسال یا انصراف‌داده.</li>
                </ul>
              </Card>
            </div>
          </div>
        </>
      )}

      {confirm && (
        <ConfirmDialog
          open
          title={confirmText[confirm].title}
          description={confirmText[confirm].description}
          confirmLabel={confirmText[confirm].label}
          tone={confirmText[confirm].tone}
          loading={act.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => act.mutate(confirm)}
        />
      )}
    </>
  );
}
