"use client";

import type { PublicSettings } from "@bcp/shared";
import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { api } from "@/lib/api";

export function usePublicSettings() {
  return useQuery({ queryKey: ["public-settings"], queryFn: () => api<PublicSettings>("/settings"), staleTime: 60_000 });
}

/** The system-wide notice set by platform admins; renders nothing when empty. */
export function AnnouncementBanner() {
  const settings = usePublicSettings();
  if (!settings.data?.announcement) return null;
  return (
    <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
      <Megaphone className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="whitespace-pre-wrap">{settings.data.announcement}</p>
    </div>
  );
}
