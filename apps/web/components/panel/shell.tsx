"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ROLE_LABELS_FA, type MeResponse } from "@bcp/shared";
import { Brand } from "@/components/layout/brand";
import { cn } from "@/lib/cn";
import { useLogout } from "@/lib/session";

export interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
  /** Not built yet: rendered as a disabled entry with a badge, never as a dead link. */
  soon?: boolean;
  exact?: boolean;
}

export function PanelShell({
  me,
  nav,
  title,
  headerExtra,
  children,
}: {
  me: MeResponse;
  nav: NavItem[];
  title: string;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const logout = useLogout();

  const sidebar = (
    <nav aria-label={title} className="flex h-full flex-col gap-1 p-3">
      {nav.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        if (item.soon) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400"
            >
              <item.Icon className="size-5" aria-hidden="true" />
              <span className="flex-1">{item.label}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">به‌زودی</span>
            </span>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-100",
            )}
          >
            <item.Icon className="size-5" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:right-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow">
        پرش به محتوای اصلی
      </a>
      <aside className="hidden border-l border-slate-200 bg-white lg:block">
        <div className="flex h-16 items-center border-b border-slate-200 px-5">
          <Brand href="/app" />
        </div>
        {sidebar}
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-slate-900/40" aria-label="بستن منو" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 right-0 w-72 bg-white shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
              <Brand href="/app" />
              <button className="rounded-lg p-2 hover:bg-slate-100" aria-label="بستن منو" onClick={() => setOpen(false)}>
                <X className="size-5" />
              </button>
            </div>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" aria-label="باز کردن منو" aria-expanded={open} onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1">{headerExtra}</div>
          <div className="hidden text-left sm:block">
            <p className="text-sm font-medium text-slate-900">{me.user.fullName}</p>
            <p className="ltr text-xs text-slate-500">{me.user.email}</p>
          </div>
          {me.user.platformRole && (
            <span className="hidden rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 md:inline">
              {ROLE_LABELS_FA[me.user.platformRole]}
            </span>
          )}
          <button onClick={() => void logout()} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
            <LogOut className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">خروج</span>
          </button>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
