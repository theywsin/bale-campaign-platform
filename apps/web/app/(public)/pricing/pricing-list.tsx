"use client";

import type { PlanInfo } from "@bcp/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PlanLimits, planPeriod, planPrice } from "@/components/billing/plan";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";

/** Prices come from the live plan table, never from hard-coded copy. */
export function PricingList() {
  const plans = useQuery({ queryKey: ["public-plans"], queryFn: () => api<PlanInfo[]>("/plans") });
  if (plans.isPending) return <LoadingBlock />;
  if (plans.isError) return <Alert tone="error" className="mt-6">{errorMessage(plans.error)}</Alert>;
  if (plans.data.length === 0) {
    return (
      <Alert tone="info" title="هنوز پلنی منتشر نشده است" className="mt-6">
        مدیر سامانه هنوز پلنی برای فروش تعریف نکرده است. تا آن زمان استفاده از امکانات فعال بدون پرداخت ممکن است.
      </Alert>
    );
  }
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {plans.data.map((p) => (
        <Card key={p.id} className="flex flex-col">
          <h2 className="font-bold text-slate-900">{p.name}</h2>
          <p className="mt-2 text-xl font-bold text-brand-700">{planPrice(p)}</p>
          <p className="text-sm text-slate-500">برای {planPeriod(p.periodDays)}</p>
          {p.description && <p className="mt-2 text-sm text-slate-600">{p.description}</p>}
          <div className="mt-3 flex-1"><PlanLimits plan={p} /></div>
          <Link href="/register" className="mt-4 rounded-lg bg-brand-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-brand-700">
            ثبت‌نام و خرید
          </Link>
        </Card>
      ))}
    </div>
  );
}
