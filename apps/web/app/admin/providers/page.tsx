"use client";

import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Badge, Card, PageHeader, StatCard } from "@/components/ui/card";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";

interface ProviderStatus {
  provider: "BALE_BOT" | "MOCK";
  enabled: boolean;
  apiHost: string | null;
  activeAccounts: number;
  disabledAccounts: number;
  attempts24h: Record<"ACCEPTED" | "FAILED_RETRYABLE" | "FAILED_PERMANENT" | "UNKNOWN" | "IN_FLIGHT", number>;
  lastAcceptedAt: string | null;
}
interface ProvidersResponse {
  providers: ProviderStatus[];
  pipeline: { outboxPending: number; outboxFailed: number; oldestPendingSeconds: number | null; recipientsProcessing: number; unknown24h: number };
}

const NAMES = { BALE_BOT: "بازوی بله (API رسمی)", MOCK: "ارائه‌دهنده آزمایشی" } as const;
const OUTCOMES = [
  ["ACCEPTED", "پذیرفته‌شده"],
  ["FAILED_RETRYABLE", "خطای موقت"],
  ["FAILED_PERMANENT", "خطای دائمی"],
  ["UNKNOWN", "نامشخص"],
  ["IN_FLIGHT", "در حال ارسال"],
] as const;

export default function AdminProvidersPage() {
  const data = useQuery({ queryKey: ["admin-providers"], queryFn: () => api<ProvidersResponse>("/admin/providers"), refetchInterval: 30_000 });
  return (
    <>
      <PageHeader
        title="وضعیت اتصال ارائه‌دهنده"
        description="از داده واقعی ۲۴ ساعت اخیر محاسبه می‌شود؛ هر ۳۰ ثانیه به‌روز می‌شود. هیچ توکن یا رازی نمایش داده نمی‌شود."
      />
      {data.isPending ? (
        <LoadingBlock />
      ) : data.isError ? (
        <Alert tone="error">{errorMessage(data.error)}</Alert>
      ) : (
        <>
          <h2 className="mb-3 font-semibold text-slate-900">صف ارسال</h2>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="رویدادهای در انتظار (Outbox)"
              value={formatNumber(data.data.pipeline.outboxPending)}
              hint={data.data.pipeline.oldestPendingSeconds !== null ? `قدیمی‌ترین: ${formatNumber(data.data.pipeline.oldestPendingSeconds)} ثانیه پیش` : "صف خالی است"}
            />
            <StatCard label="رویدادهای ناموفق Outbox" value={formatNumber(data.data.pipeline.outboxFailed)} />
            <StatCard label="گیرندگان در حال پردازش" value={formatNumber(data.data.pipeline.recipientsProcessing)} />
            <StatCard label="نتیجه نامشخص (۲۴ ساعت)" value={formatNumber(data.data.pipeline.unknown24h)} hint="به‌طور خودکار دوباره ارسال نمی‌شوند." />
          </div>
          {data.data.pipeline.oldestPendingSeconds !== null && data.data.pipeline.oldestPendingSeconds > 300 && (
            <Alert tone="warning" className="mb-6">رویدادی بیش از ۵ دقیقه در صف مانده است. سلامت سرویس worker و scheduler را بررسی کنید.</Alert>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {data.data.providers.map((p) => {
              const total = Object.values(p.attempts24h).reduce((a, b) => a + b, 0);
              return (
                <Card key={p.provider}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold text-slate-900">{NAMES[p.provider]}</h2>
                    {p.enabled ? <Badge tone="green">فعال</Badge> : <Badge tone="slate">غیرفعال</Badge>}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {p.apiHost && (
                      <>
                        <dt className="text-slate-500">نشانی API</dt>
                        <dd className="ltr text-left font-mono">{p.apiHost}</dd>
                      </>
                    )}
                    <dt className="text-slate-500">حساب‌های فعال / غیرفعال</dt>
                    <dd>{formatNumber(p.activeAccounts)} / {formatNumber(p.disabledAccounts)}</dd>
                    <dt className="text-slate-500">آخرین ارسال پذیرفته‌شده</dt>
                    <dd>{formatDateTime(p.lastAcceptedAt)}</dd>
                  </dl>
                  <h3 className="mt-4 mb-2 text-sm font-medium text-slate-700">تلاش‌های ارسال در ۲۴ ساعت اخیر ({formatNumber(total)})</h3>
                  <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                    {OUTCOMES.map(([k, label]) => (
                      <li key={k} className="rounded-lg bg-slate-50 px-3 py-2">
                        <span className="block text-xs text-slate-500">{label}</span>
                        <span className="font-semibold text-slate-900">{formatNumber(p.attempts24h[k])}</span>
                      </li>
                    ))}
                  </ul>
                  {!p.enabled && p.provider === "BALE_BOT" && (
                    <p className="mt-3 text-xs text-slate-500">کلید رمزنگاری اطلاعات اتصال (CREDENTIALS_ENCRYPTION_KEY) تنظیم نشده است.</p>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
