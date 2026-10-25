import type { OrganizationRole, PlatformRole } from "./roles";

/** Response shapes shared between the API and the web client. */

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
  requestId?: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
  platformRole: PlatformRole | null;
  createdAt: string;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: OrganizationRole;
  createdAt: string;
}

export interface MeResponse {
  user: CurrentUser;
  organizations: OrganizationSummary[];
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
}

export interface MemberInfo {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: OrganizationRole;
  joinedAt: string;
}

export interface InvitationInfo {
  id: string;
  email: string;
  role: OrganizationRole;
  expiresAt: string;
  createdAt: string;
  invitedBy: string | null;
}

export interface HealthResponse {
  status: "ok" | "degraded" | "error";
  service: string;
  version: string;
  time: string;
  checks?: Record<string, { status: "up" | "down"; latencyMs?: number; error?: string }>;
}

export interface ContactInfo {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  baleChatId: string | null;
  notes: string | null;
  consent: "UNKNOWN" | "OPTED_IN" | "OPTED_OUT";
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
}

export interface ContactListInfo {
  id: string;
  name: string;
  description: string | null;
  contactCount: number;
  createdAt: string;
}

export interface SuppressionInfo {
  id: string;
  kind: "PHONE" | "BALE_CHAT_ID";
  value: string;
  reason: string | null;
  createdAt: string;
}

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ContactImportResult {
  id: string;
  fileName: string;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  invalidCount: number;
  errors: ImportRowError[];
  createdAt: string;
}

export interface MessagingAccountInfo {
  id: string;
  provider: "MOCK" | "BALE_BOT";
  displayName: string;
  status: "ACTIVE" | "DISABLED";
  rateLimitPerMinute: number;
  /** True for the test-only mock provider; the UI must label it. */
  isTestOnly: boolean;
  createdAt: string;
}

export type RecipientCounts = Record<
  "PENDING" | "PROCESSING" | "ACCEPTED" | "DELIVERED" | "FAILED" | "UNKNOWN" | "SUPPRESSED",
  number
>;

export interface CampaignInfo {
  id: string;
  name: string;
  messageText: string;
  status: "DRAFT" | "SCHEDULED" | "QUEUED" | "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED" | "FAILED";
  messagingAccount: { id: string; displayName: string; provider: "MOCK" | "BALE_BOT" } | null;
  list: { id: string; name: string } | null;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  counts: RecipientCounts;
  totalRecipients: number;
}

export interface CampaignRecipientInfo {
  id: string;
  contactId: string | null;
  contactName: string | null;
  chatId: string | null;
  status: keyof RecipientCounts;
  attemptCount: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  acceptedAt: string | null;
  deliveredAt: string | null;
  updatedAt: string;
}
