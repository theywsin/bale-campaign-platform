"use client";

import { Ban, ChevronDown, CreditCard, LayoutDashboard, LifeBuoy, ListTree, Megaphone, MessagesSquare, Settings, Shield, UserCog, Users } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ROLE_LABELS_FA } from "@bcp/shared";
import { PanelShell, type NavItem } from "@/components/panel/shell";
import { RequireMe } from "@/components/panel/require-me";
import { EmptyState } from "@/components/ui/card";

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();

  useEffect(() => {
    try {
      localStorage.setItem("bcp:lastOrg", orgId);
    } catch {
      /* storage unavailable */
    }
  }, [orgId]);

  return (
    <RequireMe>
      {(me) => {
        const org = me.organizations.find((o) => o.id === orgId);
        if (!org) {
          return (
            <div className="mx-auto max-w-md p-6">
              <EmptyState
                title="فضای کاری یافت نشد"
                description="این فضای کاری وجود ندارد یا شما عضو آن نیستید."
                action={<Link href="/app" className="text-brand-700 hover:underline">بازگشت</Link>}
              />
            </div>
          );
        }
        const base = `/app/${orgId}`;
        const canManage = org.role !== "ORGANIZATION_MEMBER";
        const nav: NavItem[] = [
          { href: base, label: "داشبورد", Icon: LayoutDashboard, exact: true },
          { href: `${base}/contacts`, label: "مخاطبان", Icon: Users },
          { href: `${base}/lists`, label: "فهرست‌های مخاطبان", Icon: ListTree },
          { href: `${base}/suppressions`, label: "فهرست عدم ارسال", Icon: Ban },
          { href: `${base}/campaigns`, label: "کمپین‌ها", Icon: Megaphone },
          { href: `${base}/messaging-accounts`, label: "حساب‌های پیام‌رسان", Icon: MessagesSquare },
          { href: `${base}/billing`, label: "اشتراک و پرداخت", Icon: CreditCard, soon: true },
          { href: `${base}/support`, label: "تیکت پشتیبانی", Icon: LifeBuoy, soon: true },
          { href: `${base}/members`, label: "اعضا و نقش‌ها", Icon: UserCog },
          ...(canManage ? [{ href: `${base}/settings`, label: "تنظیمات فضای کاری", Icon: Settings }] : []),
          { href: `${base}/account`, label: "پروفایل و امنیت", Icon: Shield },
        ];
        if (me.user.platformRole) nav.push({ href: "/admin", label: "پنل مدیریت سامانه", Icon: Shield });

        const switcher = (
          <div className="relative inline-flex max-w-full items-center">
            <label htmlFor="org-switcher" className="sr-only">انتخاب فضای کاری</label>
            <select
              id="org-switcher"
              value={orgId}
              onChange={(e) => (e.target.value === "__new" ? router.push("/app/new-workspace") : router.push(`/app/${e.target.value}`))}
              className="max-w-full appearance-none truncate rounded-lg border border-slate-200 bg-white py-1.5 ps-3 pe-8 text-sm font-medium text-slate-900 hover:border-slate-300"
            >
              {me.organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({ROLE_LABELS_FA[o.role]})
                </option>
              ))}
              <option value="__new">+ فضای کاری جدید</option>
            </select>
            <ChevronDown className="pointer-events-none absolute left-2 size-4 text-slate-500" aria-hidden="true" />
          </div>
        );
        return (
          <PanelShell me={me} nav={nav} title="منوی پنل" headerExtra={switcher}>
            {children}
          </PanelShell>
        );
      }}
    </RequireMe>
  );
}
