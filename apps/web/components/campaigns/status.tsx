import { CAMPAIGN_STATUS_LABELS_FA, RECIPIENT_STATUS_LABELS_FA, type CampaignStatus, type RecipientStatus } from "@bcp/shared";
import { Badge } from "@/components/ui/card";

const CAMPAIGN_TONE: Record<CampaignStatus, "slate" | "brand" | "green" | "red" | "amber"> = {
  DRAFT: "slate",
  SCHEDULED: "brand",
  QUEUED: "brand",
  RUNNING: "brand",
  PAUSED: "amber",
  COMPLETED: "green",
  CANCELLED: "slate",
  FAILED: "red",
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return <Badge tone={CAMPAIGN_TONE[status]}>{CAMPAIGN_STATUS_LABELS_FA[status]}</Badge>;
}

const RECIPIENT_TONE: Record<RecipientStatus, "slate" | "brand" | "green" | "red" | "amber"> = {
  PENDING: "slate",
  PROCESSING: "brand",
  ACCEPTED: "green",
  DELIVERED: "green",
  FAILED: "red",
  UNKNOWN: "amber",
  SUPPRESSED: "slate",
};

export function RecipientStatusBadge({ status }: { status: RecipientStatus }) {
  return <Badge tone={RECIPIENT_TONE[status]}>{RECIPIENT_STATUS_LABELS_FA[status]}</Badge>;
}
