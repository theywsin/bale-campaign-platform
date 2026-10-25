"use client";

import type { OrganizationSummary } from "@bcp/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type OrgDetails = OrganizationSummary & { status: string; memberCount: number; pendingInvitations: number };

export const orgKey = (orgId: string) => ["org", orgId] as const;

export function useOrg(orgId: string) {
  return useQuery({ queryKey: orgKey(orgId), queryFn: () => api<OrgDetails>(`/organizations/${orgId}`) });
}
