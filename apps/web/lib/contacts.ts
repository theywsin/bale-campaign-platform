"use client";

import type { ContactListInfo } from "@bcp/shared";
import { CONSENT_LABELS_FA, type ConsentStatus } from "@bcp/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export const accountsKey = (orgId: string) => ["messaging-accounts", orgId] as const;

export const listsKey = (orgId: string) => ["lists", orgId] as const;

export function useLists(orgId: string) {
  return useQuery({ queryKey: listsKey(orgId), queryFn: () => api<ContactListInfo[]>(`/organizations/${orgId}/lists`) });
}

export const consentOptions = (Object.keys(CONSENT_LABELS_FA) as ConsentStatus[]).map((v) => ({ value: v, label: CONSENT_LABELS_FA[v] }));

/** Shows +989121234567 as 09121234567 for Iranian numbers. */
export function displayPhone(phone: string | null): string {
  if (!phone) return "—";
  return phone.startsWith("+98") ? `0${phone.slice(3)}` : phone;
}

export function contactName(c: { firstName: string | null; lastName: string | null }): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || "بدون نام";
}
