"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { planInputSchema, platformRoleHasPermission, type PlanInfo, type PlanInput } from "@bcp/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { PlanLimits, planPeriod, planPrice } from "@/components/billing/plan";
import { applyServerErrors } from "@/components/forms";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { useMe } from "@/lib/session";

type AdminPlan = PlanInfo & { activeSubscriptions: number };

export default function AdminPlansPage() {
  const me = useMe();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AdminPlan | "new" | null>(null);
  const plans = useQuery({ queryKey: ["admin-plans"], queryFn: () => api<AdminPlan[]>("/admin/plans") });
  const canWrite = platformRoleHasPermission(me.data?.user.platformRole, "admin:plans:write");

  return (
    <>
      <PageHeader
        title="پلن‌ها"
        description="قیمت به ریال؛ سقف خالی یعنی نامحدود. تغییر قیمت فقط روی سفارش‌های جدید اثر دارد."
        actions={canWrite ? <Button onClick={() => setEditing("new")}>پلن جدید</Button> : undefined}
      />
      <Card>
        {plans.isPending ? (
          <LoadingBlock />
        ) : plans.isError ? (
          <Alert tone="error">{errorMessage(plans.error)}</Alert>
        ) : plans.data.length === 0 ? (
          <EmptyState title="هنوز پلنی تعریف نشده است" description="تا وقتی پلنی تعریف نشود، محدودیتی بر فضاهای کاری اعمال نمی‌شود." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {plans.data.map((p) => (
              <li key={p.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                    {p.name} <span className="ltr text-xs text-slate-500">{p.code}</span>
                    {p.isDefault && <Badge tone="brand">پلن پایه</Badge>}
                    {!p.isActive && <Badge tone="slate">غیرفعال</Badge>}
                    {!p.isPublic && <Badge tone="amber">مخفی</Badge>}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{planPrice(p)} برای {planPeriod(p.periodDays)} — {formatNumber(p.activeSubscriptions)} اشتراک فعال</p>
                  <div className="mt-2"><PlanLimits plan={p} /></div>
                </div>
                {canWrite && <Button variant="secondary" size="sm" onClick={() => setEditing(p)}>ویرایش</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Dialog open={editing !== null} title={editing === "new" ? "پلن جدید" : "ویرایش پلن"} onClose={() => setEditing(null)}>
        {editing && (
          <PlanForm
            plan={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onDone={async () => {
              setEditing(null);
              await qc.invalidateQueries({ queryKey: ["admin-plans"] });
            }}
          />
        )}
      </Dialog>
    </>
  );
}

const limitValue = (v: number | null) => (v === null ? "" : String(v));

function PlanForm({ plan, onDone, onCancel }: { plan: PlanInfo | null; onDone: () => Promise<void>; onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<PlanInput>({
    resolver: zodResolver(planInputSchema),
    defaultValues: plan
      ? {
          ...plan,
          description: plan.description ?? "",
          priceRials: plan.priceRials,
          maxContacts: limitValue(plan.maxContacts),
          maxMonthlyMessages: limitValue(plan.maxMonthlyMessages),
          maxMessagingAccounts: limitValue(plan.maxMessagingAccounts),
          maxMembers: limitValue(plan.maxMembers),
        }
      : { code: "", name: "", description: "", priceRials: "", periodDays: 30, maxContacts: "", maxMonthlyMessages: "", maxMessagingAccounts: "", maxMembers: "", isPublic: true, isActive: true, isDefault: false, sortOrder: 0 },
  });
  const e = form.formState.errors;
  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      if (plan) {
        const { code: _code, ...rest } = values;
        await api(`/admin/plans/${plan.id}`, { method: "PATCH", body: rest });
      } else {
        await api("/admin/plans", { method: "POST", body: values });
      }
      await onDone();
    } catch (err) {
      setError(applyServerErrors(err, form.setError));
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate aria-label="فرم پلن" className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="کد (انگلیسی)" ltr disabled={plan !== null} error={e.code?.message} {...form.register("code")} />
        <Field label="نام" error={e.name?.message} {...form.register("name")} />
      </div>
      <Field label="توضیح" error={e.description?.message} {...form.register("description")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="قیمت (ریال)" type="number" ltr min={0} error={e.priceRials?.message} {...form.register("priceRials")} />
        <Field label="مدت (روز)" type="number" ltr min={1} error={e.periodDays?.message} {...form.register("periodDays")} />
        <Field label="سقف مخاطب" type="number" ltr min={0} hint="خالی = نامحدود" error={e.maxContacts?.message} {...form.register("maxContacts")} />
        <Field label="سقف پیام ماهانه" type="number" ltr min={0} error={e.maxMonthlyMessages?.message} {...form.register("maxMonthlyMessages")} />
        <Field label="سقف حساب ارسال" type="number" ltr min={0} error={e.maxMessagingAccounts?.message} {...form.register("maxMessagingAccounts")} />
        <Field label="سقف عضو (با دعوت‌های باز)" type="number" ltr min={0} error={e.maxMembers?.message} {...form.register("maxMembers")} />
        <Field label="ترتیب نمایش" type="number" ltr min={0} error={e.sortOrder?.message} {...form.register("sortOrder")} />
      </div>
      <fieldset className="space-y-2 text-sm text-slate-700">
        <label className="flex items-center gap-2"><input type="checkbox" {...form.register("isActive")} /> فعال (قابل خرید و اعمال)</label>
        <label className="flex items-center gap-2"><input type="checkbox" {...form.register("isPublic")} /> نمایش در صفحه قیمت‌ها و صفحه خرید</label>
        <label className="flex items-center gap-2"><input type="checkbox" {...form.register("isDefault")} /> پلن پایه (محدودیت فضاهای کاری بدون اشتراک)</label>
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>انصراف</Button>
        <Button type="submit" loading={form.formState.isSubmitting}>ذخیره</Button>
      </div>
    </form>
  );
}
