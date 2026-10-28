"use client";

import { formatRials, platformRoleHasPermission } from "@bcp/shared";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { PageHeader, StatCard } from "@/components/ui/card";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { useMe } from "@/lib/session";

interface Stats {
  users: number;
  suspendedUsers: number;
  newUsers7d: number;
  organizations: number;
  activeSessions: number;
  failedLogins24h: number;
}

interface BillingStats {
  activeSubscriptions: number;
  pendingOrders: number;
  availableLicenses: number;
  /** Null for roles without access to payment data. */
  revenue30dRials: string | null;
}

export default function AdminDashboard() {
  const me = useMe();
  const stats = useQuery({ queryKey: ["admin-stats"], queryFn: () => api<Stats>("/admin/stats"), refetchInterval: 60_000 });
  const canBilling = platformRoleHasPermission(me.data?.user.platformRole, "admin:subscriptions:read");
  const billing = useQuery({ queryKey: ["admin-billing-stats"], queryFn: () => api<BillingStats>("/admin/billing/stats"), enabled: canBilling, refetchInterval: 60_000 });
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
      {billing.data && (
        <>
          <h2 className="mb-3 mt-8 text-lg font-bold text-slate-900">فروش</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="اشتراک‌های فعال" value={formatNumber(billing.data.activeSubscriptions)} />
            <StatCard label="سفارش‌های در انتظار پرداخت" value={formatNumber(billing.data.pendingOrders)} />
            <StatCard label="کلیدهای لایسنس آماده" value={formatNumber(billing.data.availableLicenses)} />
            {billing.data.revenue30dRials !== null && <StatCard label="درآمد ۳۰ روز اخیر" value={formatRials(billing.data.revenue30dRials)} />}
          </div>
        </>
      )}
    </>
  );
}
