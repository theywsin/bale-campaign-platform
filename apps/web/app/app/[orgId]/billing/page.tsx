"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { orgRoleHasPermission, PLAN_LIMIT_KEYS, PLAN_LIMIT_LABELS, redeemLicenseSchema, type BillingOverview, type CheckoutResult, type PlanInfo } from "@bcp/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ORDER_STATUS, PlanLimits, planPeriod, planPrice, SUBSCRIPTION_SOURCE } from "@/components/billing/plan";
import { applyServerErrors } from "@/components/forms";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { useOrg } from "@/lib/org";

const billingKey = (orgId: string) => ["billing", orgId] as const;

export default function BillingPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const org = useOrg(orgId);
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const canRead = org.data ? orgRoleHasPermission(org.data.role, "billing:read") : false;
  const canWrite = org.data ? orgRoleHasPermission(org.data.role, "billing:write") : false;
  const billing = useQuery({
    queryKey: billingKey(orgId),
    queryFn: () => api<BillingOverview>(`/organizations/${orgId}/billing`),
    enabled: canRead,
    // Payments complete on another page; never show a stale subscription.
    refetchOnMount: "always",
  });
  const checkout = useMutation({
    mutationFn: (plan: PlanInfo) => api<CheckoutResult>(`/organizations/${orgId}/billing/checkout`, { method: "POST", body: { planId: plan.id } }),
    onSuccess: async (r) => {
      if (r.redirectUrl) {
        router.push(r.redirectUrl);
        return;
      }
      setNotice({ tone: "success", text: "پلن رایگان فعال شد." });
      await qc.invalidateQueries({ queryKey: billingKey(orgId) });
    },
    onError: (err) => setNotice({ tone: "error", text: errorMessage(err) }),
  });

  if (org.isPending) return <LoadingBlock />;
  if (!canRead) {
    return (
      <>
        <PageHeader title="اشتراک و پرداخت" />
        <Alert tone="info">مشاهده اشتراک فقط برای مالک و مدیران فضای کاری ممکن است.</Alert>
      </>
    );
  }
  if (billing.isPending) return <LoadingBlock />;
  if (billing.isError) return <Alert tone="error">{errorMessage(billing.error)}</Alert>;
  const b = billing.data;

  return (
    <>
      <PageHeader title="اشتراک و پرداخت" description="پلن فعلی، میزان مصرف و خرید یا تمدید اشتراک." />
      {notice && <Alert tone={notice.tone} className="mb-4">{notice.text}</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-bold text-slate-900">پلن فعلی</h2>
          {b.subscription ? (
            <div className="mt-3 space-y-1 text-sm text-slate-700">
              <p className="text-lg font-bold text-slate-900">{b.subscription.plan.name}</p>
              <p>اعتبار تا {formatDateTime(b.subscription.endsAt)}</p>
              <p className="text-slate-500">از طریق {SUBSCRIPTION_SOURCE[b.subscription.source]} — آغاز {formatDate(b.subscription.startsAt)}</p>
            </div>
          ) : b.plan ? (
            <p className="mt-3 text-sm text-slate-700">اشتراک فعالی ندارید؛ محدودیت‌های پلن پایه «{b.plan.name}» اعمال می‌شود.</p>
          ) : (
            <p className="mt-3 text-sm text-slate-700">اشتراک فعالی ندارید و در این استقرار محدودیتی تعریف نشده است.</p>
          )}
        </Card>
        <Card>
          <h2 className="font-bold text-slate-900">مصرف</h2>
          <ul className="mt-3 space-y-3">
            {PLAN_LIMIT_KEYS.map((k) => {
              const limit = b.limits[k];
              const used = b.usage[k];
              const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
              return (
                <li key={k}>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-700">{PLAN_LIMIT_LABELS[k]}{k === "maxMonthlyMessages" ? " (این ماه)" : ""}</span>
                    <span className="text-slate-900">{formatNumber(used)} از {limit === null ? "نامحدود" : formatNumber(limit)}</span>
                  </div>
                  {limit !== null && (
                    <div className="mt-1 h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={PLAN_LIMIT_LABELS[k]}>
                      <div className={`h-2 rounded-full ${pct >= 90 ? "bg-red-500" : "bg-brand-600"}`} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold text-slate-900">پلن‌ها</h2>
      {b.paymentsTestOnly && (
        <Alert tone="warning" className="mb-4" title="درگاه آزمایشی">
          درگاه پرداخت این استقرار آزمایشی است: هیچ پولی جابه‌جا نمی‌شود و فقط برای آزمودن روند خرید است.
        </Alert>
      )}
      {!b.paymentsEnabled && (
        <Alert tone="info" className="mb-4">پرداخت آنلاین در این استقرار فعال نیست. برای خرید پلن پولی با پشتیبانی تماس بگیرید یا کلید لایسنس وارد کنید.</Alert>
      )}
      {b.plans.length === 0 ? (
        <Card><EmptyState title="هنوز پلنی برای فروش تعریف نشده است" /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {b.plans.map((p) => {
            const current = b.subscription?.plan.id === p.id;
            const payable = p.priceRials === "0" || b.paymentsEnabled;
            return (
              <Card key={p.id} className="flex flex-col">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-slate-900">{p.name}</h3>
                  {current && <Badge tone="green">پلن فعلی</Badge>}
                </div>
                <p className="mt-2 text-xl font-bold text-brand-700">{planPrice(p)}</p>
                <p className="text-sm text-slate-500">برای {planPeriod(p.periodDays)}</p>
                {p.description && <p className="mt-2 text-sm text-slate-600">{p.description}</p>}
                <div className="mt-3 flex-1"><PlanLimits plan={p} /></div>
                {canWrite && (
                  <Button
                    className="mt-4"
                    aria-label={`${current ? "تمدید" : p.priceRials === "0" ? "فعال‌سازی" : "خرید"} ${p.name}`}
                    disabled={!payable} loading={checkout.isPending && checkout.variables?.id === p.id} onClick={() => checkout.mutate(p)}>
                    {current ? "تمدید" : p.priceRials === "0" ? "فعال‌سازی" : "خرید"}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {!canWrite && <p className="mt-3 text-sm text-slate-500">خرید و تمدید فقط توسط مالک فضای کاری ممکن است.</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-[20rem_1fr]">
        {canWrite && (
          <Card>
            <h2 className="font-bold text-slate-900">فعال‌سازی با کلید لایسنس</h2>
            <RedeemForm orgId={orgId} onDone={async () => { setNotice({ tone: "success", text: "کلید لایسنس فعال شد." }); await qc.invalidateQueries({ queryKey: billingKey(orgId) }); }} />
          </Card>
        )}
        <Card className="min-w-0">
          <h2 className="font-bold text-slate-900">سفارش‌ها</h2>
          {b.orders.length === 0 ? (
            <EmptyState title="هنوز سفارشی ثبت نشده است" />
          ) : (
            <div className="relative mt-3 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-right text-slate-500">
                    <th scope="col" className="py-2 font-medium">پلن</th>
                    <th scope="col" className="py-2 font-medium">مبلغ</th>
                    <th scope="col" className="py-2 font-medium">تاریخ</th>
                    <th scope="col" className="py-2 font-medium">وضعیت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {b.orders.map((o) => (
                    <tr key={o.id}>
                      <td className="py-2.5">{o.plan.name}</td>
                      <td className="py-2.5">{planPrice({ priceRials: o.amountRials })}</td>
                      <td className="py-2.5 text-slate-600">{formatDateTime(o.createdAt)}</td>
                      <td className="py-2.5"><Badge tone={ORDER_STATUS[o.status][1]}>{ORDER_STATUS[o.status][0]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function RedeemForm({ orgId, onDone }: { orgId: string; onDone: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ key: string }>({ resolver: zodResolver(redeemLicenseSchema), defaultValues: { key: "" } });
  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api(`/organizations/${orgId}/billing/redeem-license`, { method: "POST", body: values });
      form.reset();
      await onDone();
    } catch (err) {
      setError(applyServerErrors(err, form.setError));
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate aria-label="فعال‌سازی لایسنس" className="mt-3 space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="کلید لایسنس" ltr autoComplete="off" placeholder="BCP-XXXX-XXXX-XXXX-XXXX" error={form.formState.errors.key?.message} {...form.register("key")} />
      <Button type="submit" loading={form.formState.isSubmitting}>فعال‌سازی</Button>
    </form>
  );
}
