import type { OrganizationRole, PlatformRole } from "./roles";
import { ORGANIZATION_ROLE_RANK } from "./roles";

/** Permissions inside a tenant. Checked together with membership of that tenant. */
export const ORG_PERMISSIONS = [
  "org:read",
  "org:update",
  "org:delete",
  "members:read",
  "members:invite",
  "members:update-role",
  "members:remove",
  "contacts:read",
  "contacts:write",
  "contacts:export",
  "campaigns:read",
  "campaigns:write",
  "campaigns:send",
  "messaging-accounts:read",
  "messaging-accounts:write",
  "billing:read",
  "billing:write",
  "audit:read",
  "support:read",
  "support:write",
] as const;
export type OrgPermission = (typeof ORG_PERMISSIONS)[number];

/** Permissions on the operator's admin panel. */
export const PLATFORM_PERMISSIONS = [
  "admin:dashboard",
  "admin:users:read",
  "admin:users:write",
  "admin:orgs:read",
  "admin:orgs:write",
  "admin:plans:write",
  "admin:subscriptions:read",
  "admin:subscriptions:write",
  "admin:licenses:write",
  "admin:payments:read",
  "admin:payments:sensitive",
  "admin:campaigns:moderate",
  "admin:messaging-secrets:read",
  "admin:tickets:read",
  "admin:tickets:write",
  "admin:audit:read",
  "admin:settings:write",
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

const MEMBER: readonly OrgPermission[] = [
  "org:read",
  "members:read",
  "contacts:read",
  "contacts:write",
  "campaigns:read",
  "campaigns:write",
  "messaging-accounts:read",
  "support:read",
  "support:write",
];

const ORG_ADMIN: readonly OrgPermission[] = [
  ...MEMBER,
  "org:update",
  "members:invite",
  "members:update-role",
  "members:remove",
  "contacts:export",
  "campaigns:send",
  "messaging-accounts:write",
  "billing:read",
  "audit:read",
];

const ORG_OWNER: readonly OrgPermission[] = [...ORG_ADMIN, "org:delete", "billing:write"];

export const ORG_ROLE_PERMISSIONS: Record<OrganizationRole, ReadonlySet<OrgPermission>> = {
  ORGANIZATION_MEMBER: new Set(MEMBER),
  ORGANIZATION_ADMIN: new Set(ORG_ADMIN),
  ORGANIZATION_OWNER: new Set(ORG_OWNER),
};

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, ReadonlySet<PlatformPermission>> = {
  SUPER_ADMIN: new Set(PLATFORM_PERMISSIONS),
  ADMIN: new Set(
    PLATFORM_PERMISSIONS.filter((p) => p !== "admin:messaging-secrets:read" && p !== "admin:payments:sensitive"),
  ),
  // SUPPORT must not see messaging credentials or sensitive payment data by default.
  SUPPORT: new Set<PlatformPermission>([
    "admin:dashboard",
    "admin:users:read",
    "admin:orgs:read",
    "admin:subscriptions:read",
    "admin:tickets:read",
    "admin:tickets:write",
  ]),
  BILLING_ADMIN: new Set<PlatformPermission>([
    "admin:dashboard",
    "admin:orgs:read",
    "admin:plans:write",
    "admin:subscriptions:read",
    "admin:subscriptions:write",
    "admin:licenses:write",
    "admin:payments:read",
    "admin:payments:sensitive",
  ]),
  MODERATOR: new Set<PlatformPermission>([
    "admin:dashboard",
    "admin:orgs:read",
    "admin:campaigns:moderate",
    "admin:tickets:read",
  ]),
};

export function orgRoleHasPermission(role: OrganizationRole, permission: OrgPermission): boolean {
  return ORG_ROLE_PERMISSIONS[role].has(permission);
}

export function platformRoleHasPermission(role: PlatformRole | null | undefined, permission: PlatformPermission): boolean {
  if (!role) return false;
  return PLATFORM_ROLE_PERMISSIONS[role].has(permission);
}

/**
 * Whether `actor` may assign `targetRole` to a member currently holding `currentRole`.
 * Rules: only owners grant or revoke ownership; nobody acts on a member ranked above them.
 */
export function canAssignOrganizationRole(
  actor: OrganizationRole,
  currentRole: OrganizationRole,
  targetRole: OrganizationRole,
): boolean {
  if (!orgRoleHasPermission(actor, "members:update-role")) return false;
  const actorRank = ORGANIZATION_ROLE_RANK[actor];
  if (ORGANIZATION_ROLE_RANK[currentRole] > actorRank) return false;
  if (ORGANIZATION_ROLE_RANK[targetRole] > actorRank) return false;
  if ((currentRole === "ORGANIZATION_OWNER" || targetRole === "ORGANIZATION_OWNER") && actor !== "ORGANIZATION_OWNER") {
    return false;
  }
  return true;
}

/** Whether `actor` may remove a member holding `targetRole`. */
export function canRemoveOrganizationMember(actor: OrganizationRole, targetRole: OrganizationRole): boolean {
  if (!orgRoleHasPermission(actor, "members:remove")) return false;
  return ORGANIZATION_ROLE_RANK[targetRole] <= ORGANIZATION_ROLE_RANK[actor];
}
