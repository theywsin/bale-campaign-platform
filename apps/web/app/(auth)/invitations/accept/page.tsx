import type { Metadata } from "next";
import { Suspense } from "react";
import { AcceptInvitation } from "./accept";

export const metadata: Metadata = { title: "پذیرش دعوت" };

export default function AcceptInvitationPage() {
  return (
    <>
      <h1 className="text-xl font-bold text-slate-900">پذیرش دعوت به فضای کاری</h1>
      <Suspense>
        <AcceptInvitation />
      </Suspense>
    </>
  );
}
