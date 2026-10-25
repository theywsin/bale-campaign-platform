"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CAMPAIGN_MESSAGE_MAX_LENGTH, createCampaignSchema, type CampaignInfo, type CreateCampaignInput, type MessagingAccountInfo } from "@bcp/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { applyServerErrors } from "@/components/forms";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import { api } from "@/lib/api";
import { accountsKey, useLists } from "@/lib/contacts";
import { formatNumber } from "@/lib/format";

/** Create (campaign = null) or edit a draft campaign. */
export function CampaignForm({ orgId, campaign, onSaved }: { orgId: string; campaign: CampaignInfo | null; onSaved: (c: CampaignInfo) => void | Promise<void> }) {
  const lists = useLists(orgId);
  const accounts = useQuery({
    queryKey: accountsKey(orgId),
    queryFn: () => api<{ mockEnabled: boolean; items: MessagingAccountInfo[] }>(`/organizations/${orgId}/messaging-accounts`),
  });
  const [error, setError] = useState<string | null>(null);
  const form = useForm<CreateCampaignInput>({
    resolver: zodResolver(createCampaignSchema),
    defaultValues: {
      name: campaign?.name ?? "",
      messageText: campaign?.messageText ?? "",
      messagingAccountId: campaign?.messagingAccount?.id ?? "",
      listId: campaign?.list?.id ?? "",
    },
  });
  const text = form.watch("messageText") ?? "";
  const active = accounts.data?.items.filter((a) => a.status === "ACTIVE") ?? [];

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const body = { ...values, listId: values.listId || null };
    try {
      const saved = campaign
        ? await api<CampaignInfo>(`/organizations/${orgId}/campaigns/${campaign.id}`, { method: "PATCH", body })
        : await api<CampaignInfo>(`/organizations/${orgId}/campaigns`, { method: "POST", body });
      await onSaved(saved);
    } catch (err) {
      setError(applyServerErrors(err, form.setError));
    }
  });

  if (accounts.data && active.length === 0) {
    return (
      <Alert tone="warning" title="ابتدا یک حساب ارسال فعال بسازید">
        برای ساخت کمپین به یک حساب پیام‌رسان فعال نیاز دارید.{" "}
        <Link href={`/app/${orgId}/messaging-accounts`} className="font-medium underline">حساب‌های پیام‌رسان</Link>
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="نام کمپین" error={form.formState.errors.name?.message} {...form.register("name")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="حساب ارسال"
          options={[{ value: "", label: "انتخاب کنید" }, ...active.map((a) => ({ value: a.id, label: a.isTestOnly ? `${a.displayName} (آزمایشی)` : a.displayName }))]}
          error={form.formState.errors.messagingAccountId?.message}
          {...form.register("messagingAccountId")}
        />
        <SelectField
          label="گیرندگان"
          options={[{ value: "", label: "همه مخاطبان فعال" }, ...(lists.data ?? []).map((l) => ({ value: l.id, label: `${l.name} (${formatNumber(l.contactCount)})` }))]}
          error={form.formState.errors.listId?.message}
          {...form.register("listId")}
        />
      </div>
      <TextareaField
        label="متن پیام"
        rows={7}
        maxLength={CAMPAIGN_MESSAGE_MAX_LENGTH}
        error={form.formState.errors.messageText?.message}
        hint={`${formatNumber(text.length)} از ${formatNumber(CAMPAIGN_MESSAGE_MAX_LENGTH)} کاراکتر`}
        {...form.register("messageText")}
      />
      <Button type="submit" loading={form.formState.isSubmitting}>{campaign ? "ذخیره تغییرات" : "ذخیره پیش‌نویس"}</Button>
    </form>
  );
}
