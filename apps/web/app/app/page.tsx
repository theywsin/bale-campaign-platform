"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LoadingBlock } from "@/components/ui/spinner";
import { useMe } from "@/lib/session";

const LAST_ORG_KEY = "bcp:lastOrg";

/** Sends the user to their last used workspace, or to workspace creation if they have none. */
export default function AppIndex() {
  const { data } = useMe();
  const router = useRouter();
  useEffect(() => {
    if (data === undefined) return;
    if (data === null) return router.replace("/login?next=/app");
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_ORG_KEY);
    } catch {
      /* storage unavailable */
    }
    const target = data.organizations.find((o) => o.id === last) ?? data.organizations[0];
    router.replace(target ? `/app/${target.id}` : "/app/new-workspace");
  }, [data, router]);
  return <LoadingBlock />;
}
