"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createOrganizationSchema, type CreateOrganizationInput, type OrganizationSummary } from "@bcp/shared";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Brand } from "@/components/layout/brand";
import { applyServerErrors } from "@/components/forms";
import { RequireMe } from "@/components/panel/require-me";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { api } from "@/lib/api";
import { ME_KEY } from "@/lib/session";

export default function NewWorkspacePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<CreateOrganizationInput>({ resolver: zodResolver(createOrganizationSchema), defaultValues: { name: "" } });
  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const org = await api<OrganizationSummary>("/organizations", { method: "POST", body: values });
      await qc.invalidateQueries({ queryKey: ME_KEY });
      router.replace(`/app/${org.id}`);
    } catch (err) {
      setError(applyServerErrors(err, form.setError));
    }
  });

  return (
    <RequireMe>
      {(me) => (
        <div className="mx-auto max-w-md px-4 py-10">
          <Brand href="/app" />
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-xl font-bold text-slate-900">ساخت فضای کاری جدید</h1>
            <p className="mt-1 text-sm text-slate-600">هر فضای کاری مخاطبان، اعضا و تنظیمات جداگانه دارد.</p>
            <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
              {error && <Alert tone="error">{error}</Alert>}
              <Field label="نام فضای کاری" error={form.formState.errors.name?.message} {...form.register("name")} />
              <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>ساخت فضای کاری</Button>
            </form>
            {me.organizations.length > 0 && (
              <p className="mt-6 text-center text-sm">
                <Link href="/app" className="text-brand-700 hover:underline">بازگشت به پنل</Link>
              </p>
            )}
          </div>
        </div>
      )}
    </RequireMe>
  );
}
