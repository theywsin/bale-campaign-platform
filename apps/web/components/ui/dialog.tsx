"use client";

import { useEffect, useId, useRef } from "react";

/** Native <dialog> wrapper for forms. Escape closes it through onClose. */
export function Dialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby={titleId}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      <div className="p-6" dir="rtl">
        <h2 id={titleId} className="text-lg font-bold text-slate-900">{title}</h2>
        <div className="mt-4">{open && children}</div>
      </div>
    </dialog>
  );
}
