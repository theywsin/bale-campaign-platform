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
