import type { Metadata } from "next";
import { StatusBoard } from "./status-board";

export const metadata: Metadata = { title: "وضعیت سرویس" };

export default function StatusPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold">وضعیت سرویس</h1>
      <p className="mt-2 text-slate-600">وضعیت لحظه‌ای اجزای اصلی سامانه. این صفحه هر ۳۰ ثانیه به‌روز می‌شود.</p>
      <StatusBoard />
    </section>
  );
}
