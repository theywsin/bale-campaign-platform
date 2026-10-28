"use client";

import { platformRoleHasPermission, TICKET_PRIORITIES, TICKET_PRIORITY_LABELS, type TicketDetail } from "@bcp/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { categoryLabel, ReplyForm, TicketStatusBadge, TicketThread } from "@/components/support/ticket";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { SelectField } from "@/components/ui/field";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useMe } from "@/lib/session";

export default function AdminTicketPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const qc = useQueryClient();
  const me = useMe();
  const canWrite = platformRoleHasPermission(me.data?.user.platformRole, "admin:tickets:write");
  const key = ["admin-ticket", ticketId];
  const path = `/admin/tickets/${ticketId}`;
  const [notice, setNotice] = useState<string | null>(null);
  const ticket = useQuery({ queryKey: key, queryFn: () => api<TicketDetail>(path), refetchInterval: 30_000 });
  const save = (t: TicketDetail) => {
    qc.setQueryData(key, t);
    void qc.invalidateQueries({ queryKey: ["admin-tickets"] });
  };
  const update = useMutation({
    mutationFn: (body: { status?: string; priority?: string }) => api<TicketDetail>(path, { method: "PATCH", body }),
    onSuccess: (t) => {
      setNotice(null);
      save(t);
    },
    onError: (err) => setNotice(errorMessage(err)),
  });

  if (ticket.isPending) return <LoadingBlock />;
  if (ticket.isError) return <Alert tone="error">{errorMessage(ticket.error)}</Alert>;
  const t = ticket.data;
  return (
    <>
      <Link href="/admin/tickets" className="mb-3 inline-block text-sm text-brand-700 hover:underline">→ صف تیکت‌ها</Link>
      <PageHeader
        title={t.subject}
        description={`${t.organization.name} · ${categoryLabel(t.category)} · ثبت ${formatDateTime(t.createdAt)}${t.createdBy ? ` توسط ${t.createdBy}` : ""}`}
        actions={
          canWrite ? (
            t.status === "CLOSED" ? (
              <Button variant="secondary" loading={update.isPending} onClick={() => update.mutate({ status: "OPEN" })}>بازکردن دوباره</Button>
            ) : (
              <Button variant="secondary" loading={update.isPending} onClick={() => update.mutate({ status: "CLOSED" })}>بستن تیکت</Button>
            )
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <TicketStatusBadge status={t.status} />
        {canWrite && (
          <SelectField
            label="اولویت"
            className="w-40"
            value={t.priority}
            disabled={update.isPending}
            onChange={(e) => update.mutate({ priority: e.target.value })}
            options={TICKET_PRIORITIES.map((p) => ({ value: p, label: TICKET_PRIORITY_LABELS[p] }))}
          />
        )}
      </div>
      {notice && <Alert tone="error" className="mb-4">{notice}</Alert>}
      <Card className="mb-4">
        <TicketThread ticket={t} staffView />
      </Card>
      {canWrite ? (
        <Card>
          <ReplyForm closed={t.status === "CLOSED"} onSend={async (body) => save(await api<TicketDetail>(`${path}/messages`, { method: "POST", body: { body } }))} />
        </Card>
      ) : (
        <Alert>نقش شما فقط اجازه مشاهده تیکت‌ها را می‌دهد.</Alert>
      )}
    </>
  );
}
