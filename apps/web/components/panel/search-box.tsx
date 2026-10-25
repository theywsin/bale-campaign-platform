"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";

/** Debounced search input. */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => {
      if (draft !== value) onChange(draft);
    }, 350);
    return () => clearTimeout(t);
  }, [draft, value, onChange]);
  return (
    <div className="relative w-full sm:max-w-xs">
      <label htmlFor="search" className="sr-only">{placeholder}</label>
      <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        id="search"
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        maxLength={200}
        className="w-full rounded-lg border border-slate-300 bg-white py-2 pe-3 ps-9 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
      />
    </div>
  );
}
