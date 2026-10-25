"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  canAssignOrganizationRole,
  canRemoveOrganizationMember,
  inviteMemberSchema,
  ORGANIZATION_ROLES,
  orgRoleHasPermission,
  ROLE_LABELS_FA,
  type InvitationInfo,
  type InviteMemberInput,
  type MemberInfo,
  type OrganizationRole,
} from "@bcp/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { applyServerErrors } from "@/components/forms";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, SelectField } from "@/components/ui/field";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { orgKey, useOrg } from "@/lib/org";
import { ME_KEY, useMe } from "@/lib/session";

const roleOptions = (allowed: readonly OrganizationRole[]) => allowed.map((r) => ({ value: r, label: ROLE_LABELS_FA[r] }));

export default function MembersPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const org = useOrg(orgId);
  const me = useMe();
  const qc = useQueryClient();
  const router = useRouter();
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "remove"; member: MemberInfo } | { kind: "revoke"; invitation: InvitationInfo } | null>(null);

  const myRole = org.data?.role;
  const canInvite = myRole ? orgRoleHasPermission(myRole, "members:invite") : false;

  const members = useQuery({ queryKey: ["members", orgId], queryFn: () => api<MemberInfo[]>(`/organizations/${orgId}/members`) });
  const invitations = useQuery({
    queryKey: ["invitations", orgId],
    queryFn: () => api<InvitationInfo[]>(`/organizations/${orgId}/invitations`),
    enabled: canInvite,
  });
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["members", orgId] }),
      qc.invalidateQueries({ queryKey: ["invitations", orgId] }),
      qc.invalidateQueries({ queryKey: orgKey(orgId) }),
    ]);

  const changeRole = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: OrganizationRole }) =>
      api(`/organizations/${orgId}/members/${memberId}`, { method: "PATCH", body: { role } }),
    onSuccess: async () => {
      setNotice({ tone: "success", text: "نقش عضو به‌روزرسانی شد." });
      await refresh();
    },
    onError: (err) => setNotice({ tone: "error", text: errorMessage(err) }),
  });

  const remove = useMutation({
    mutationFn: (member: MemberInfo) => api(`/organizations/${orgId}/members/${member.id}`, { method: "DELETE" }),
    onSuccess: async (_d, member) => {
      setConfirm(null);
      if (member.userId === me.data?.user.id) {
        await qc.invalidateQueries({ queryKey: ME_KEY });
        router.replace("/app");
        return;
      }
      setNotice({ tone: "success", text: "عضو از فضای کاری حذف شد." });
      await refresh();
    },
    onError: (err) => {
      setConfirm(null);
      setNotice({ tone: "error", text: errorMessage(err) });
    },
  });

  const revoke = useMutation({
    mutationFn: (inv: InvitationInfo) => api(`/organizations/${orgId}/invitations/${inv.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setConfirm(null);
      setNotice({ tone: "success", text: "دعوت‌نامه لغو شد." });
      await refresh();
    },
    onError: (err) => {
      setConfirm(null);
      setNotice({ tone: "error", text: errorMessage(err) });
    },
  });

  if (org.isPending || members.isPending) return <LoadingBlock />;
  if (org.isError) return <Alert tone="error">{errorMessage(org.error)}</Alert>;
  if (members.isError) return <Alert tone="error">{errorMessage(members.error)}</Alert>;
  const role = org.data.role;

  return (
    <>
      <PageHeader title="اعضا و نقش‌ها" description="مالک همه دسترسی‌ها را دارد؛ مدیر می‌تواند اعضا را مدیریت کند؛ عضو به امور روزمره دسترسی دارد." />
      {notice && <Alert tone={notice.tone} className="mb-4">{notice.text}</Alert>}

      <Card>
        <h2 className="font-bold text-slate-900">اعضا</h2>
        <div className="relative mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-right text-slate-500">
                <th scope="col" className="py-2 font-medium">نام</th>
                <th scope="col" className="py-2 font-medium">ایمیل</th>
                <th scope="col" className="py-2 font-medium">نقش</th>
                <th scope="col" className="py-2 font-medium">تاریخ عضویت</th>
                <th scope="col" className="py-2"><span className="sr-only">عملیات</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.data.map((m) => {
                const isMe = m.userId === me.data?.user.id;
                const assignable = ORGANIZATION_ROLES.filter((r) => r === m.role || canAssignOrganizationRole(role, m.role, r));
                const canChange = !isMe && assignable.length > 1;
                const canRemove = isMe || canRemoveOrganizationMember(role, m.role);
                return (
                  <tr key={m.id}>
                    <td className="py-3 font-medium text-slate-900">
                      {m.fullName} {isMe && <span className="text-xs text-slate-500">(شما)</span>}
                    </td>
                    <td className="ltr py-3 text-slate-600">{m.email}</td>
                    <td className="py-3">
                      {canChange ? (
                        <>
                          <label htmlFor={`role-${m.id}`} className="sr-only">نقش {m.fullName}</label>
                          <select
                            id={`role-${m.id}`}
                            value={m.role}
                            disabled={changeRole.isPending}
                            onChange={(e) => changeRole.mutate({ memberId: m.id, role: e.target.value as OrganizationRole })}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                          >
                            {roleOptions(assignable).map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </>
                      ) : (
                        ROLE_LABELS_FA[m.role]
                      )}
                    </td>
                    <td className="py-3 text-slate-600">{formatDate(m.joinedAt)}</td>
                    <td className="py-3 text-left">
                      {canRemove && (
                        <Button variant="ghost" size="sm" className="text-red-700" onClick={() => setConfirm({ kind: "remove", member: m })}>
                          {isMe ? "خروج از فضای کاری" : "حذف"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {canInvite && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <InviteCard orgId={orgId} myRole={role} onInvited={async (email) => {
            setNotice({ tone: "success", text: `دعوت‌نامه برای ${email} ثبت شد.` });
            await refresh();
          }} />
          <Card>
            <h2 className="font-bold text-slate-900">دعوت‌نامه‌های در انتظار</h2>
            {invitations.isPending ? (
              <LoadingBlock />
            ) : invitations.isError ? (
              <Alert tone="error" className="mt-4">{errorMessage(invitations.error)}</Alert>
            ) : invitations.data.length === 0 ? (
              <div className="mt-4"><EmptyState title="دعوت‌نامه فعالی وجود ندارد" /></div>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100">
                {invitations.data.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="ltr truncate font-medium text-slate-900">{inv.email}</p>
                      <p className="text-xs text-slate-500">{ROLE_LABELS_FA[inv.role]} — معتبر تا {formatDate(inv.expiresAt)}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-red-700" onClick={() => setConfirm({ kind: "revoke", invitation: inv })}>
                      لغو
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirm?.kind === "remove"}
        title={confirm?.kind === "remove" && confirm.member.userId === me.data?.user.id ? "خروج از فضای کاری" : "حذف عضو"}
        description={
          confirm?.kind === "remove"
            ? confirm.member.userId === me.data?.user.id
              ? "پس از خروج، دسترسی شما به این فضای کاری قطع می‌شود و برای بازگشت باید دوباره دعوت شوید."
              : `دسترسی ${confirm.member.fullName} به این فضای کاری قطع می‌شود.`
            : ""
        }
        confirmLabel={confirm?.kind === "remove" && confirm.member.userId === me.data?.user.id ? "خروج" : "حذف عضو"}
        loading={remove.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm?.kind === "remove" && remove.mutate(confirm.member)}
      />
      <ConfirmDialog
        open={confirm?.kind === "revoke"}
        title="لغو دعوت‌نامه"
        description={confirm?.kind === "revoke" ? `دعوت‌نامه ${confirm.invitation.email} باطل می‌شود و پیوند آن دیگر کار نمی‌کند.` : ""}
        confirmLabel="لغو دعوت‌نامه"
        loading={revoke.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm?.kind === "revoke" && revoke.mutate(confirm.invitation)}
      />
    </>
  );
}

function InviteCard({ orgId, myRole, onInvited }: { orgId: string; myRole: OrganizationRole; onInvited: (email: string) => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  // Only owners may invite owners; admins can invite admins and members.
  const allowed = ORGANIZATION_ROLES.filter((r) => r !== "ORGANIZATION_OWNER" || myRole === "ORGANIZATION_OWNER");
  const form = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: "", role: "ORGANIZATION_MEMBER" },
  });
  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api(`/organizations/${orgId}/invitations`, { method: "POST", body: values });
      form.reset({ email: "", role: values.role });
      await onInvited(values.email);
    } catch (err) {
      setError(applyServerErrors(err, form.setError));
    }
  });
  return (
    <Card>
      <h2 className="font-bold text-slate-900">دعوت عضو جدید</h2>
      <p className="mt-1 text-sm text-slate-600">پیوند دعوت به ایمیل وارد‌شده ارسال می‌شود و ۷ روز معتبر است.</p>
      <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="ایمیل" type="email" ltr error={form.formState.errors.email?.message} {...form.register("email")} />
        <SelectField label="نقش" options={roleOptions(allowed)} error={form.formState.errors.role?.message} {...form.register("role")} />
        <Button type="submit" loading={form.formState.isSubmitting}>ارسال دعوت‌نامه</Button>
      </form>
    </Card>
  );
}
