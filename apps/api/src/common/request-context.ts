import type { OrganizationRole, PlatformRole } from "@bcp/shared";
import type { Request } from "express";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  platformRole: PlatformRole | null;
  emailVerified: boolean;
  createdAt: Date;
}

export interface AuthSession {
  id: string;
}

export interface OrgContext {
  organizationId: string;
  memberId: string;
  role: OrganizationRole;
}

export interface AppRequest extends Request {
  auth?: { user: AuthUser; session: AuthSession };
  org?: OrgContext;
}

/** Client metadata recorded on sessions and audit entries. */
export interface ClientInfo {
  ipAddress: string | null;
  userAgent: string | null;
}

export function clientInfo(req: Request): ClientInfo {
  const ua = req.headers["user-agent"];
  return {
    ipAddress: req.ip ? req.ip.slice(0, 45) : null,
    userAgent: typeof ua === "string" ? ua.slice(0, 500) : null,
  };
}
