"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import { Card, PageHeader } from "@/components/ui/card";

export default function NewCampaignPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  return (
    <>
      <PageHeader title="کمپین جدید" description="کمپین ابتدا به‌صورت پیش‌نویس ذخیره می‌شود. ارسال یا زمان‌بندی از صفحه کمپین انجام می‌شود." />
      <Card className="max-w-3xl">
        <CampaignForm
          orgId={orgId}
          campaign={null}
          onSaved={async (c) => {
            await qc.invalidateQueries({ queryKey: ["campaigns", orgId] });
            router.push(`/app/${orgId}/campaigns/${c.id}`);
          }}
        />
      </Card>
    </>
  );
}
