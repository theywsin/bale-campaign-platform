"use client";

import { Building2, LayoutDashboard, ScrollText, Users, CreditCard, KeyRound, Flag, LifeBuoy, Settings, Package, Plug, ArrowRight, Receipt } from "lucide-react";
import Link from "next/link";
import { platformRoleHasPermission } from "@bcp/shared";
import { PanelShell, type NavItem } from "@/components/panel/shell";
import { RequireMe } from "@/components/panel/require-me";
import { Alert } from "@/components/ui/alert";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireMe>
      {(me) => {
        const role = me.user.platformRole;
        if (!role || !platformRoleHasPermission(role, "admin:dashboard")) {
          return (
            <div className="mx-auto max-w-md p-6">
              <Alert tone="error" title="دسترسی غیرمجاز">شما به پنل مدیریت سامانه دسترسی ندارید.</Alert>
              <Link href="/app" className="mt-4 inline-block text-brand-700 hover:underline">بازگشت به پنل</Link>
            </div>
          );
        }
        const can = (p: Parameters<typeof platformRoleHasPermission>[1]) => platformRoleHasPermission(role, p);
        const nav: NavItem[] = [
          { href: "/admin", label: "داشبورد مدیریتی", Icon: LayoutDashboard, exact: true },
          ...(can("admin:users:read") ? [{ href: "/admin/users", label: "کاربران", Icon: Users }] : []),
          ...(can("admin:orgs:read") ? [{ href: "/admin/organizations", label: "سازمان‌ها", Icon: Building2 }] : []),
          ...(can("admin:subscriptions:read") ? [{ href: "/admin/plans", label: "پلن‌ها", Icon: Package }] : []),
          ...(can("admin:subscriptions:read") ? [{ href: "/admin/subscriptions", label: "اشتراک‌ها", Icon: CreditCard }] : []),
          ...(can("admin:licenses:write") ? [{ href: "/admin/licenses", label: "لایسنس‌ها", Icon: KeyRound }] : []),
          ...(can("admin:payments:read") ? [{ href: "/admin/payments", label: "سفارش‌ها و پرداخت‌ها", Icon: Receipt }] : []),
          { href: "/admin/reported-campaigns", label: "کمپین‌های گزارش‌شده", Icon: Flag, soon: true },
          { href: "/admin/providers", label: "وضعیت اتصال ارائه‌دهنده", Icon: Plug, soon: true },
          { href: "/admin/tickets", label: "تیکت‌ها", Icon: LifeBuoy, soon: true },
          ...(can("admin:audit:read") ? [{ href: "/admin/audit-logs", label: "گزارش ممیزی", Icon: ScrollText }] : []),
          { href: "/admin/settings", label: "تنظیمات سامانه", Icon: Settings, soon: true },
          { href: "/app", label: "بازگشت به پنل مشتری", Icon: ArrowRight },
        ];
        return (
          <PanelShell me={me} nav={nav} title="منوی مدیریت" headerExtra={<span className="font-bold text-slate-900">پنل مدیریت سامانه</span>}>
            {children}
          </PanelShell>
        );
      }}
    </RequireMe>
  );
}
