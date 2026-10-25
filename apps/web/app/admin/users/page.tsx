"use client";

import { platformRoleHasPermission, ROLE_LABELS_FA, type Paginated, type PlatformRole } from "@bcp/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SearchBox } from "@/components/panel/search-box";
import { Alert } from "@/components/ui/alert";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pagination } from "@/components/ui/pagination";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { useMe } from "@/lib/session";

interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  status: "ACTIVE" | "SUSPENDED";
  platformRole: PlatformRole | null;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  organizationCount: number;
}

const PAGE_SIZE = 20;

export default function AdminUsersPage() {
  const me = useMe();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const canWrite = platformRoleHasPermission(me.data?.user.platformRole, "admin:users:write");

  const users = useQuery({
    queryKey: ["admin-users", q, page],
    queryFn: () => api<Paginated<AdminUser>>(`/admin/users?${new URLSearchParams({ q, page: String(page), pageSize: String(PAGE_SIZE) })}`),
    placeholderData: keepPreviousData,
  });

  const setStatus = useMutation({
    mutationFn: (u: AdminUser) =>
      api(`/admin/users/${u.id}/status`, { method: "PATCH", body: { status: u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" } }),
    onSuccess: async (_d, u) => {
      setTarget(null);
      setNotice({ tone: "success", text: u.status === "ACTIVE" ? `حساب ${u.email} تعلیق شد.` : `حساب ${u.email} فعال شد.` });
      await qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err) => {
      setTarget(null);
      setNotice({ tone: "error", text: errorMessage(err) });
    },
  });

  return (
    <>
      <PageHeader title="کاربران" description="جست‌وجو بر اساس نام یا ایمیل." actions={<SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="جست‌وجوی کاربر" />} />
      {notice && <Alert tone={notice.tone} className="mb-4">{notice.text}</Alert>}
      <Card>
        {users.isPending ? (
          <LoadingBlock />
        ) : users.isError ? (
          <Alert tone="error">{errorMessage(users.error)}</Alert>
        ) : users.data.items.length === 0 ? (
          <EmptyState title={q ? "کاربری با این مشخصات یافت نشد" : "هنوز کاربری ثبت‌نام نکرده است"} />
        ) : (
          <>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-right text-slate-500">
                    <th scope="col" className="py-2 font-medium">کاربر</th>
                    <th scope="col" className="py-2 font-medium">نقش سامانه</th>
                    <th scope="col" className="py-2 font-medium">فضای کاری</th>
                    <th scope="col" className="py-2 font-medium">آخرین ورود</th>
                    <th scope="col" className="py-2 font-medium">عضویت</th>
                    <th scope="col" className="py-2 font-medium">وضعیت</th>
                    <th scope="col" className="py-2"><span className="sr-only">عملیات</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.data.items.map((u) => (
                    <tr key={u.id}>
                      <td className="py-3">
                        <p className="font-medium text-slate-900">{u.fullName}</p>
                        <p className="ltr text-xs text-slate-500">{u.email}</p>
                      </td>
                      <td className="py-3">{u.platformRole ? <Badge tone="amber">{ROLE_LABELS_FA[u.platformRole]}</Badge> : "—"}</td>
                      <td className="py-3">{formatNumber(u.organizationCount)}</td>
                      <td className="py-3 text-slate-600">{formatDateTime(u.lastLoginAt)}</td>
                      <td className="py-3 text-slate-600">{formatDate(u.createdAt)}</td>
                      <td className="py-3">
                        <Badge tone={u.status === "ACTIVE" ? "green" : "red"}>{u.status === "ACTIVE" ? "فعال" : "تعلیق‌شده"}</Badge>
                      </td>
                      <td className="py-3 text-left">
                        {canWrite && u.id !== me.data?.user.id && (
                          <Button variant="ghost" size="sm" className={u.status === "ACTIVE" ? "text-red-700" : undefined} onClick={() => setTarget(u)}>
                            {u.status === "ACTIVE" ? "تعلیق" : "فعال‌سازی"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={users.data.total} onPage={setPage} />
          </>
        )}
      </Card>
      <ConfirmDialog
        open={target !== null}
        title={target?.status === "ACTIVE" ? "تعلیق حساب کاربر" : "فعال‌سازی حساب کاربر"}
        description={
          target?.status === "ACTIVE"
            ? `همه نشست‌های ${target.email} بسته می‌شود و تا فعال‌سازی دوباره نمی‌تواند وارد شود. این عملیات در گزارش ممیزی ثبت می‌شود.`
            : `${target?.email ?? ""} دوباره می‌تواند وارد حساب خود شود.`
        }
        confirmLabel={target?.status === "ACTIVE" ? "تعلیق حساب" : "فعال‌سازی"}
        tone={target?.status === "ACTIVE" ? "danger" : "primary"}
        loading={setStatus.isPending}
        onCancel={() => setTarget(null)}
        onConfirm={() => target && setStatus.mutate(target)}
      />
    </>
  );
}
