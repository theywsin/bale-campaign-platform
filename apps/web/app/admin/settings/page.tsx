"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { platformRoleHasPermission, systemSettingsSchema, type PublicSettings } from "@bcp/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { applyServerErrors } from "@/components/forms";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Field, TextareaField } from "@/components/ui/field";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { useMe } from "@/lib/session";

type Input = z.input<typeof systemSettingsSchema>;

export default function AdminSettingsPage() {
  const me = useMe();
  const canWrite = platformRoleHasPermission(me.data?.user.platformRole, "admin:settings:write");
  const settings = useQuery({ queryKey: ["admin-settings"], queryFn: () => api<PublicSettings>("/admin/settings"), enabled: canWrite });
  return (
    <>
      <PageHeader title="تنظیمات سامانه" description="تغییرات در گزارش ممیزی ثبت می‌شود و حداکثر پس از چند ثانیه برای همه اعمال می‌شود." />
      {!canWrite ? (
        <Alert tone="error">فقط مدیر ارشد سامانه می‌تواند تنظیمات را ببیند و تغییر دهد.</Alert>
      ) : settings.isPending ? (
        <LoadingBlock />
      ) : settings.isError ? (
        <Alert tone="error">{errorMessage(settings.error)}</Alert>
      ) : (
        <SettingsForm initial={settings.data} />
      )}
    </>
  );
}

function SettingsForm({ initial }: { initial: PublicSettings }) {
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const form = useForm<Input>({
    resolver: zodResolver(systemSettingsSchema),
    defaultValues: { registrationEnabled: initial.registrationEnabled, announcement: initial.announcement ?? "", supportEmail: initial.supportEmail ?? "" },
  });
  const e = form.formState.errors;
  const onSubmit = form.handleSubmit(async (values) => {
    setNotice(null);
    try {
      const saved = await api<PublicSettings>("/admin/settings", { method: "PUT", body: values });
      qc.setQueryData(["admin-settings"], saved);
      await qc.invalidateQueries({ queryKey: ["public-settings"] });
      form.reset({ registrationEnabled: saved.registrationEnabled, announcement: saved.announcement ?? "", supportEmail: saved.supportEmail ?? "" });
      setNotice({ tone: "success", text: "تنظیمات ذخیره شد." });
    } catch (err) {
      setNotice({ tone: "error", text: applyServerErrors(err, form.setError) });
    }
  });
  return (
    <Card className="max-w-2xl">
      <form onSubmit={onSubmit} noValidate aria-label="تنظیمات سامانه" className="space-y-5">
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 size-4 accent-brand-600" {...form.register("registrationEnabled")} />
          <span>
            <span className="font-medium text-slate-800">ثبت‌نام کاربران جدید باز است</span>
            <span className="mt-0.5 block text-slate-500">اگر بسته باشد، فقط کاربران موجود و دعوت‌شدگانی که حساب دارند وارد می‌شوند.</span>
          </span>
        </label>
        <TextareaField
          label="اطلاعیه پنل"
          rows={3}
          hint="بالای همه صفحه‌های پنل مشتری نمایش داده می‌شود. خالی بگذارید تا نمایش داده نشود."
          error={e.announcement?.message}
          {...form.register("announcement")}
        />
        <Field label="ایمیل پشتیبانی" ltr type="email" hint="در صفحه تیکت پشتیبانی نمایش داده می‌شود." error={e.supportEmail?.message} {...form.register("supportEmail")} />
        <div className="flex justify-end">
          <Button type="submit" loading={form.formState.isSubmitting} disabled={!form.formState.isDirty}>ذخیره تنظیمات</Button>
        </div>
      </form>
    </Card>
  );
}
