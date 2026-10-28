"use client";

import type { TicketDetail } from "@bcp/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { categoryLabel, ReplyForm, TicketPriorityBadge, TicketStatusBadge, TicketThread } from "@/components/support/ticket";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

export default function TicketPage() {
  const { orgId, ticketId } = useParams<{ orgId: string; ticketId: string }>();
  const qc = useQueryClient();
  const key = ["ticket", orgId, ticketId];
  const path = `/organizations/${orgId}/tickets/${ticketId}`;
  const [closing, setClosing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const ticket = useQuery({ queryKey: key, queryFn: () => api<TicketDetail>(path), refetchInterval: 30_000 });
  const save = (t: TicketDetail) => {
    qc.setQueryData(key, t);
    void qc.invalidateQueries({ queryKey: ["tickets", orgId] });
  };
  const close = useMutation({
    mutationFn: () => api<TicketDetail>(`${path}/close`, { method: "POST" }),
    onSuccess: (t) => {
      setClosing(false);
      save(t);
    },
    onError: (err) => {
      setClosing(false);
      setNotice(errorMessage(err));
    },
  });

  if (ticket.isPending) return <LoadingBlock />;
  if (ticket.isError) return <Alert tone="error">{errorMessage(ticket.error)}</Alert>;
  const t = ticket.data;
  return (
    <>
      <Link href={`/app/${orgId}/support`} className="mb-3 inline-block text-sm text-brand-700 hover:underline">→ همه تیکت‌ها</Link>
      <PageHeader
        title={t.subject}
        description={`${categoryLabel(t.category)} · ثبت ${formatDateTime(t.createdAt)}${t.createdBy ? ` توسط ${t.createdBy}` : ""}`}
        actions={t.status !== "CLOSED" ? <Button variant="secondary" onClick={() => setClosing(true)}>بستن تیکت</Button> : undefined}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <TicketStatusBadge status={t.status} />
        <TicketPriorityBadge priority={t.priority} />
      </div>
      {notice && <Alert tone="error" className="mb-4">{notice}</Alert>}
      <Card className="mb-4">
        <TicketThread ticket={t} staffView={false} />
      </Card>
      <Card>
        <ReplyForm closed={t.status === "CLOSED"} onSend={async (body) => save(await api<TicketDetail>(`${path}/messages`, { method: "POST", body: { body } }))} />
      </Card>
      <ConfirmDialog
        open={closing}
        title="بستن تیکت"
        description="اگر مشکل حل شده است تیکت را ببندید. هر زمان با ارسال پیام دوباره باز می‌شود."
        confirmLabel="بستن"
        tone="primary"
        loading={close.isPending}
        onCancel={() => setClosing(false)}
        onConfirm={() => close.mutate()}
      />
    </>
  );
}
