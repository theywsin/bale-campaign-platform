"use client";

import type { MeResponse } from "@bcp/shared";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Alert } from "@/components/ui/alert";
import { LoadingBlock } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api";
import { useMe } from "@/lib/session";

/** Loads the current user; redirects to login when the session is missing or expired. */
export function RequireMe({ children }: { children: (me: MeResponse) => React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (me.data === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [me.data, router, pathname]);

  if (me.isPending || me.data === null) return <LoadingBlock />;
  if (me.isError) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Alert tone="error" title="بارگذاری حساب ناموفق بود">{errorMessage(me.error)}</Alert>
      </div>
    );
  }
  return <>{children(me.data)}</>;
}
