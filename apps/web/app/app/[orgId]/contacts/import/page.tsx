"use client";

import { CSV_IMPORT_MAX_BYTES, CSV_IMPORT_MAX_ROWS, type ContactImportResult } from "@bcp/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, StatCard } from "@/components/ui/card";
import { api, apiUpload, errorMessage } from "@/lib/api";
import { useLists } from "@/lib/contacts";
import { formatDateTime, formatNumber } from "@/lib/format";

const SAMPLE = "first_name,last_name,phone,bale_chat_id,notes\nسارا,محمدی,09121234567,123456789,مشتری حضوری\n";

export default function ImportPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const lists = useLists(orgId);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [listId, setListId] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ContactImportResult | null>(null);
  const history = useQuery({ queryKey: ["imports", orgId], queryFn: () => api<ContactImportResult[]>(`/organizations/${orgId}/contacts/imports`) });

  const sampleHref = `data:text/csv;charset=utf-8,${encodeURIComponent("﻿" + SAMPLE)}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("فایل CSV را انتخاب کنید.");
    if (file.size > CSV_IMPORT_MAX_BYTES) return setError("حجم فایل بیش از ۲ مگابایت است.");
    const form = new FormData();
    form.append("file", file);
    if (listId) form.append("listId", listId);
    setBusy(true);
    try {
      const r = await apiUpload<ContactImportResult>(`/organizations/${orgId}/contacts/import`, form);
      setResult(r);
      if (fileRef.current) fileRef.current.value = "";
      setFileName(null);
      await Promise.all([qc.invalidateQueries({ queryKey: ["imports", orgId] }), qc.invalidateQueries({ queryKey: ["contacts", orgId] }), qc.invalidateQueries({ queryKey: ["lists", orgId] })]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="ورود مخاطبان از CSV" description="مخاطبان موجود (با همان موبایل یا شناسه چت) به‌روزرسانی می‌شوند و سلول‌های خالی اطلاعات قبلی را پاک نمی‌کنند." />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <form onSubmit={submit} className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <div>
              <label htmlFor="csv-file" className="mb-1.5 block text-sm font-medium text-slate-700">فایل CSV (UTF-8)</label>
              <input
                id="csv-file"
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="peer sr-only"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              />
              <div className="flex items-center gap-3 rounded-lg peer-focus-visible:ring-2 peer-focus-visible:ring-brand-300">
                <label htmlFor="csv-file" className="cursor-pointer rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100">
                  انتخاب فایل
                </label>
                <span className="min-w-0 truncate text-sm text-slate-600" dir="auto">{fileName ?? "فایلی انتخاب نشده است"}</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                حداکثر ۲ مگابایت و {formatNumber(CSV_IMPORT_MAX_ROWS)} سطر. جداکننده ویرگول یا نقطه‌ویرگول.
              </p>
            </div>
            <div>
              <label htmlFor="import-list" className="mb-1.5 block text-sm font-medium text-slate-700">افزودن به فهرست (اختیاری)</label>
              <select id="import-list" value={listId} onChange={(e) => setListId(e.target.value)} className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
                <option value="">بدون فهرست</option>
                {lists.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <Button type="submit" loading={busy}>بارگذاری و ورود</Button>
          </form>

          {result && (
            <div className="mt-6 space-y-4">
              <Alert tone={result.invalidCount ? "warning" : "success"} title="ورود فایل انجام شد">
                {result.invalidCount ? "برخی سطرها نامعتبر بودند و وارد نشدند. فهرست آن‌ها را در زیر ببینید." : "همه سطرها با موفقیت پردازش شدند."}
              </Alert>
              <div className="grid gap-3 sm:grid-cols-4">
                <StatCard label="کل سطرها" value={formatNumber(result.totalRows)} />
                <StatCard label="جدید" value={formatNumber(result.createdCount)} />
                <StatCard label="به‌روزرسانی" value={formatNumber(result.updatedCount)} />
                <StatCard label="نامعتبر" value={formatNumber(result.invalidCount)} />
              </div>
              {result.errors.length > 0 && (
                <div className="relative max-h-72 overflow-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className="text-right text-slate-500">
                        <th scope="col" className="px-3 py-2 font-medium">سطر</th>
                        <th scope="col" className="px-3 py-2 font-medium">علت</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.errors.map((e) => (
                        <tr key={e.row}>
                          <td className="px-3 py-2">{formatNumber(e.row)}</td>
                          <td className="px-3 py-2 text-slate-700">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Link href={`/app/${orgId}/contacts`} className="inline-block text-sm text-brand-700 hover:underline">مشاهده مخاطبان</Link>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="font-bold text-slate-900">ساختار فایل</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              سطر اول عنوان ستون‌هاست. حداقل یکی از ستون‌های <span className="ltr inline-block">phone</span> یا <span className="ltr inline-block">bale_chat_id</span> لازم است.
              عنوان‌های فارسی «نام»، «نام خانوادگی»، «موبایل» و «شناسه چت» هم پذیرفته می‌شوند. اعداد فارسی مجازند.
            </p>
            <a href={sampleHref} download="contacts-sample.csv" className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">دریافت فایل نمونه</a>
          </Card>
          <Card>
            <h2 className="font-bold text-slate-900">ورودهای اخیر</h2>
            {history.data && history.data.length > 0 ? (
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {history.data.map((h) => (
                  <li key={h.id} className="py-2">
                    <p className="truncate font-medium text-slate-800" dir="auto">{h.fileName}</p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(h.createdAt)} — {formatNumber(h.createdCount)} جدید، {formatNumber(h.updatedCount)} به‌روز، {formatNumber(h.invalidCount)} نامعتبر
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">هنوز فایلی وارد نشده است.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
