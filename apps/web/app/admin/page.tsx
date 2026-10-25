"use client";

import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { PageHeader, StatCard } from "@/components/ui/card";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/format";

interface Stats {
  users: number;
  suspendedUsers: number;
  newUsers7d: number;
  organizations: number;
  activeSessions: number;
  failedLogins24h: number;
}

export default function AdminDashboard() {
  const stats = useQuery({ queryKey: ["admin-stats"], queryFn: () => api<Stats>("/admin/stats"), refetchInterval: 60_000 });
  return (
    <>
      <PageHeader title="داشبورد مدیریتی" description="آمار لحظه‌ای سامانه." />
      {stats.isPending ? (
        <LoadingBlock />
      ) : stats.isError ? (
        <Alert tone="error">{errorMessage(stats.error)}</Alert>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="کل کاربران" value={formatNumber(stats.data.users)} hint={`${formatNumber(stats.data.newUsers7d)} کاربر جدید در ۷ روز اخیر`} />
          <StatCard label="کاربران تعلیق‌شده" value={formatNumber(stats.data.suspendedUsers)} />
          <StatCard label="سازمان‌های فعال" value={formatNumber(stats.data.organizations)} />
          <StatCard label="نشست‌های فعال" value={formatNumber(stats.data.activeSessions)} />
          <StatCard label="ورودهای ناموفق (۲۴ ساعت)" value={formatNumber(stats.data.failedLogins24h)} />
        </div>
      )}
    </>
  );
}
