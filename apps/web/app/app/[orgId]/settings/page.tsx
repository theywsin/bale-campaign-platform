"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { orgRoleHasPermission, updateOrganizationSchema, type UpdateOrganizationInput } from "@bcp/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { applyServerErrors } from "@/components/forms";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { orgKey, useOrg } from "@/lib/org";
import { ME_KEY } from "@/lib/session";

export default function SettingsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const org = useOrg(orgId);
  const qc = useQueryClient();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const form = useForm<UpdateOrganizationInput>({ resolver: zodResolver(updateOrganizationSchema), defaultValues: { name: "" } });

  useEffect(() => {
    if (org.data) form.reset({ name: org.data.name });
  }, [org.data, form]);

  if (org.isPending) return <LoadingBlock />;
  if (org.isError) return <Alert tone="error">{errorMessage(org.error)}</Alert>;
  const canEdit = orgRoleHasPermission(org.data.role, "org:update");

  const onSubmit = form.handleSubmit(async (values) => {
    setMessage(null);
    try {
      await api(`/organizations/${orgId}`, { method: "PATCH", body: values });
      await Promise.all([qc.invalidateQueries({ queryKey: orgKey(orgId) }), qc.invalidateQueries({ queryKey: ME_KEY })]);
      setMessage({ tone: "success", text: "تغییرات ذخیره شد." });
    } catch (err) {
      setMessage({ tone: "error", text: applyServerErrors(err, form.setError) });
    }
  });

  return (
    <>
      <PageHeader title="تنظیمات فضای کاری" />
      <Card className="max-w-2xl">
        {!canEdit && <Alert tone="info" className="mb-4">فقط مالک و مدیران می‌توانند تنظیمات را تغییر دهند.</Alert>}
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          <Field label="نام فضای کاری" disabled={!canEdit} error={form.formState.errors.name?.message} {...form.register("name")} />
          <Field label="شناسه فضای کاری" value={org.data.slug} readOnly ltr hint="این شناسه برای پشتیبانی کاربرد دارد و قابل تغییر نیست." />
          {canEdit && (
            <Button type="submit" loading={form.formState.isSubmitting}>
              ذخیره تغییرات
            </Button>
          )}
        </form>
      </Card>
    </>
  );
}
