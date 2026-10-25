"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { useMe } from "@/lib/session";
import { Brand } from "./brand";

const LINKS = [
  { href: "/features", label: "امکانات" },
  { href: "/pricing", label: "پلن‌ها و قیمت" },
  { href: "/faq", label: "پرسش‌های متداول" },
  { href: "/status", label: "وضعیت سرویس" },
];

export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const { data: me } = useMe();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Brand />
        <nav className="hidden items-center gap-6 text-sm text-slate-700 md:flex" aria-label="ناوبری اصلی">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-brand-700">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {me ? (
            <Link href="/app" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              ورود به پنل
            </Link>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                ورود
              </Link>
              <Link href="/register" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
                ثبت‌نام
              </Link>
            </>
          )}
        </div>
        <button
          type="button"
          className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "بستن منو" : "باز کردن منو"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" className="border-t border-slate-200 px-4 py-3 md:hidden" aria-label="ناوبری موبایل">
          <ul className="space-y-1">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="block rounded-lg px-3 py-2 hover:bg-slate-100" onClick={() => setOpen(false)}>
                  {l.label}
                </Link>
              </li>
            ))}
            <li className="flex gap-2 pt-2">
              {me ? (
                <Link href="/app" className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-center text-white">ورود به پنل</Link>
              ) : (
                <>
                  <Link href="/login" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-center">ورود</Link>
                  <Link href="/register" className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-center text-white">ثبت‌نام</Link>
                </>
              )}
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
