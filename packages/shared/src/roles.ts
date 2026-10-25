/**
 * Platform roles apply to the whole SaaS (staff of the operator).
 * Organization roles apply inside a single tenant (customer workspace).
 * A user can hold at most one platform role and one role per organization.
 */
export const PLATFORM_ROLES = ["SUPER_ADMIN", "ADMIN", "SUPPORT", "BILLING_ADMIN", "MODERATOR"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const ORGANIZATION_ROLES = ["ORGANIZATION_OWNER", "ORGANIZATION_ADMIN", "ORGANIZATION_MEMBER"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export const ROLE_LABELS_FA: Record<PlatformRole | OrganizationRole, string> = {
  SUPER_ADMIN: "مدیر ارشد سامانه",
  ADMIN: "مدیر سامانه",
  SUPPORT: "پشتیبانی",
  BILLING_ADMIN: "مدیر مالی",
  MODERATOR: "ناظر محتوا",
  ORGANIZATION_OWNER: "مالک",
  ORGANIZATION_ADMIN: "مدیر",
  ORGANIZATION_MEMBER: "عضو",
};

/** Higher number = more privileged. Used to prevent privilege escalation. */
export const ORGANIZATION_ROLE_RANK: Record<OrganizationRole, number> = {
  ORGANIZATION_MEMBER: 1,
  ORGANIZATION_ADMIN: 2,
  ORGANIZATION_OWNER: 3,
};

export function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === "string" && (PLATFORM_ROLES as readonly string[]).includes(value);
}

export function isOrganizationRole(value: unknown): value is OrganizationRole {
  return typeof value === "string" && (ORGANIZATION_ROLES as readonly string[]).includes(value);
}
