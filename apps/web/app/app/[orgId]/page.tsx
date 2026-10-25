"use client";

import { ROLE_LABELS_FA, orgRoleHasPermission } from "@bcp/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui/card";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { actionLabel, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { useOrg } from "@/lib/org";
import { MODULES, STATUS_LABEL } from "@/lib/roadmap";
import { useMe } from "@/lib/session";

interface Activity {
  id: string;
  action: string;
  createdAt: string;
  actorName: string | null;
}

function Welcome() {
  const welcome = useSearchParams().get("welcome");
  if (!welcome) return null;
  return (
    <Alert tone="success" title="به بله‌کمپین خوش آمدید" className="mb-6">
      فضای کاری شما ساخته شد. از بخش «اعضا و نقش‌ها» می‌توانید همکاران خود را دعوت کنید.
    </Alert>
  );
}

export default function DashboardPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const org = useOrg(orgId);
  const me = useMe();
  const canSeeActivity = org.data ? orgRoleHasPermission(org.data.role, "audit:read") : false;
  const activity = useQuery({
    queryKey: ["org-activity", orgId],
    queryFn: () => api<Activity[]>(`/organizations/${orgId}/activity`),
    enabled: canSeeActivity,
  });

  if (org.isPending) return <LoadingBlock />;
  if (org.isError) return <Alert tone="error" title="بارگذاری فضای کاری ناموفق بود">{errorMessage(org.error)}</Alert>;
  const o = org.data;

  return (
    <>
      <Suspense>
        <Welcome />
      </Suspense>
      <PageHeader title={o.name} description={`نقش شما: ${ROLE_LABELS_FA[o.role]} — ساخته‌شده در ${formatDate(o.createdAt)}`} />

      {me.data && !me.data.user.emailVerified && (
        <Alert tone="warning" className="mb-6">
          ایمیل شما هنوز تأیید نشده است. از بخش{" "}
          <Link href={`/app/${orgId}/account`} className="font-medium underline">
            پروفایل و امنیت
          </Link>{" "}
          می‌توانید پیوند تأیید را دوباره دریافت کنید.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="اعضای فضای کاری" value={formatNumber(o.memberCount)} />
        <StatCard label="دعوت‌نامه‌های در انتظار" value={formatNumber(o.pendingInvitations)} />
        <StatCard label="وضعیت فضای کاری" value={o.status === "ACTIVE" ? "فعال" : "تعلیق‌شده"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-bold text-slate-900">بخش‌های سامانه</h2>
          <p className="mt-1 text-sm text-slate-600">بخش‌هایی که هنوز فعال نشده‌اند در منو با برچسب «به‌زودی» مشخص شده‌اند.</p>
          <ul className="mt-4 divide-y divide-slate-100">
            {MODULES.map((m) => (
              <li key={m.title} className="flex items-center justify-between py-2.5 text-sm">
                <span>{m.title}</span>
                <Badge tone={m.status === "available" ? "green" : m.status === "in-progress" ? "amber" : "slate"}>{STATUS_LABEL[m.status]}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="font-bold text-slate-900">فعالیت‌های اخیر</h2>
          {!canSeeActivity ? (
            <p className="mt-4 text-sm text-slate-500">مشاهده فعالیت‌ها برای مدیران و مالک فضای کاری امکان‌پذیر است.</p>
          ) : activity.isPending ? (
            <LoadingBlock />
          ) : activity.isError ? (
            <Alert tone="error" className="mt-4">{errorMessage(activity.error)}</Alert>
          ) : activity.data.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="هنوز فعالیتی ثبت نشده است" />
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {activity.data.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span>
                    <span className="font-medium text-slate-800">{actionLabel(a.action)}</span>
                    {a.actorName && <span className="text-slate-500"> — {a.actorName}</span>}
                  </span>
                  <time className="shrink-0 text-xs text-slate-500" dateTime={a.createdAt}>
                    {formatDateTime(a.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
