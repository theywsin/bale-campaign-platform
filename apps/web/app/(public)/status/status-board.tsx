"use client";

import type { HealthResponse } from "@bcp/shared";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";

const LABELS: Record<string, string> = { api: "رابط برنامه‌نویسی (API)", database: "پایگاه داده", redis: "صف و حافظه موقت" };

async function fetchReadiness(): Promise<HealthResponse> {
  try {
    return await api<HealthResponse>("/health/ready");
  } catch (err) {
    // A 503 still carries a body describing which dependency is down.
    if (err instanceof ApiError && err.status === 503) {
      const res = await fetch("/api/v1/health/ready", { cache: "no-store" });
      return (await res.json()) as HealthResponse;
    }
    throw err;
  }
}

export function StatusBoard() {
  const { data, isPending, isError, dataUpdatedAt } = useQuery({
    queryKey: ["health"],
    queryFn: fetchReadiness,
    refetchInterval: 30_000,
    retry: false,
  });

  if (isPending) {
    return <p className="mt-8 text-slate-500" role="status">در حال بررسی وضعیت…</p>;
  }

  const rows: { key: string; up: boolean; latency?: number }[] = isError
    ? [{ key: "api", up: false }]
    : [
        { key: "api", up: true },
        ...Object.entries(data.checks ?? {}).map(([key, c]) => ({ key, up: c.status === "up", latency: c.latencyMs })),
      ];
  const allUp = rows.every((r) => r.up);

  return (
    <div className="mt-8 space-y-4">
      <div
        className={`rounded-xl border p-4 font-medium ${allUp ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}
        role="status"
      >
        {allUp ? "همه سرویس‌ها فعال هستند." : "برخی سرویس‌ها در دسترس نیستند."}
      </div>
      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between px-4 py-3">
            <span>{LABELS[r.key] ?? r.key}</span>
            <span className={`flex items-center gap-2 text-sm ${r.up ? "text-emerald-700" : "text-red-700"}`}>
              <span aria-hidden className={`size-2.5 rounded-full ${r.up ? "bg-emerald-500" : "bg-red-500"}`} />
              {r.up ? "فعال" : "غیرفعال"}
              {r.latency !== undefined && <span className="text-slate-400">({r.latency.toLocaleString("fa-IR")} میلی‌ثانیه)</span>}
            </span>
          </li>
        ))}
      </ul>
      {dataUpdatedAt > 0 && (
        <p className="text-xs text-slate-500">آخرین بررسی: {new Date(dataUpdatedAt).toLocaleTimeString("fa-IR")}</p>
      )}
    </div>
  );
}
