"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  ticketReplySchema,
  type TicketDetail,
  type TicketReplyInput,
  type TicketSummary,
} from "@bcp/shared";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { applyServerErrors } from "@/components/forms";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { TextareaField } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";

const STATUS_TONE = { OPEN: "amber", ANSWERED: "green", CLOSED: "slate" } as const;
const PRIORITY_TONE = { LOW: "slate", NORMAL: "brand", HIGH: "red" } as const;

export function TicketStatusBadge({ status }: { status: TicketSummary["status"] }) {
  return <Badge tone={STATUS_TONE[status]}>{TICKET_STATUS_LABELS[status]}</Badge>;
}

export function TicketPriorityBadge({ priority }: { priority: TicketSummary["priority"] }) {
  return <Badge tone={PRIORITY_TONE[priority]}>اولویت {TICKET_PRIORITY_LABELS[priority]}</Badge>;
}

export const categoryLabel = (c: TicketSummary["category"]) => TICKET_CATEGORY_LABELS[c];

/** The conversation, oldest first. `staffView` puts staff messages on the "own" side. */
export function TicketThread({ ticket, staffView }: { ticket: TicketDetail; staffView: boolean }) {
  return (
    <ol className="space-y-4" aria-label="پیام‌های تیکت">
      {ticket.messages.map((m) => {
        const own = m.fromStaff === staffView;
        return (
          <li key={m.id} className={cn("flex", own ? "justify-start" : "justify-end")}>
            <article
              className={cn(
                "max-w-[85%] rounded-2xl border px-4 py-3 text-sm shadow-sm sm:max-w-[75%]",
                m.fromStaff ? "border-brand-200 bg-brand-50" : "border-slate-200 bg-white",
              )}
            >
              <header className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-800">{m.authorName ?? "کاربر حذف‌شده"}</span>
                {m.fromStaff && m.authorName !== "پشتیبانی" && <Badge tone="brand">پشتیبانی</Badge>}
                <time dateTime={m.createdAt}>{formatDateTime(m.createdAt)}</time>
              </header>
              <p className="whitespace-pre-wrap leading-7 text-slate-800">{m.body}</p>
            </article>
          </li>
        );
      })}
    </ol>
  );
}

export function ReplyForm({ onSend, closed }: { onSend: (body: string) => Promise<void>; closed: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<TicketReplyInput>({ resolver: zodResolver(ticketReplySchema), defaultValues: { body: "" } });
  const onSubmit = form.handleSubmit(async ({ body }) => {
    setError(null);
    try {
      await onSend(body);
      form.reset({ body: "" });
    } catch (err) {
      setError(applyServerErrors(err, form.setError));
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate aria-label="ارسال پاسخ" className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <TextareaField
        label="پاسخ شما"
        rows={4}
        hint={closed ? "این تیکت بسته است؛ با ارسال پیام دوباره باز می‌شود." : undefined}
        error={form.formState.errors.body?.message}
        {...form.register("body")}
      />
      <div className="flex justify-end">
        <Button type="submit" loading={form.formState.isSubmitting}>ارسال پاسخ</Button>
      </div>
    </form>
  );
}
