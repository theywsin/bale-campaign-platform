"use client";

import { formatRials } from "@bcp/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Brand } from "@/components/layout/brand";
import { RequireMe } from "@/components/panel/require-me";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingBlock } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";

interface MockPayment {
  paymentId: string;
  status: "INITIATED" | "SUCCEEDED" | "FAILED" | "CANCELED";
  amountRials: string;
  planName: string;
  organizationId: string;
  organizationName: string;
}

const RESULT = {
  SUCCEEDED: ["success", "پرداخت آزمایشی موفق ثبت شد و پلن فعال شد."],
  FAILED: ["error", "پرداخت آزمایشی ناموفق ثبت شد. اشتراکی فعال نشد."],
  CANCELED: ["warning", "پرداخت آزمایشی لغو شد."],
} as const;

/** Test-only stand-in for a bank gateway page. No money moves. */
export default function MockCheckoutPage() {
  return <RequireMe>{() => <MockCheckout />}</RequireMe>;
}

function MockCheckout() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const payment = useQuery({ queryKey: ["mock-payment", paymentId], queryFn: () => api<MockPayment>(`/payments/mock/${paymentId}`) });
  const complete = useMutation({
    mutationFn: (outcome: "SUCCEEDED" | "FAILED" | "CANCELED") =>
      api<MockPayment>(`/payments/mock/${paymentId}/complete`, { method: "POST", body: { outcome } }),
    onSuccess: () => payment.refetch(),
  });

  return (
    <main id="main" className="mx-auto max-w-lg px-4 py-10">
      <div className="mb-6 flex justify-center"><Brand href="/app" /></div>
      <Alert tone="warning" title="درگاه پرداخت آزمایشی" className="mb-6">
        این صفحه یک درگاه بانکی واقعی نیست. هیچ پولی جابه‌جا نمی‌شود و فقط برای آزمودن روند خرید در محیط آزمایشی است.
      </Alert>
      <Card>
        {payment.isPending ? (
          <LoadingBlock />
        ) : payment.isError ? (
          <Alert tone="error">{errorMessage(payment.error)}</Alert>
        ) : (
          <>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-slate-500">فضای کاری</dt><dd className="font-medium">{payment.data.organizationName}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">پلن</dt><dd className="font-medium">{payment.data.planName}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">مبلغ</dt><dd className="font-bold text-brand-700">{formatRials(payment.data.amountRials)}</dd></div>
            </dl>
            {complete.isError && <Alert tone="error" className="mt-4">{errorMessage(complete.error)}</Alert>}
            {payment.data.status === "INITIATED" ? (
              <div className="mt-6 flex flex-wrap gap-2">
                <Button loading={complete.isPending && complete.variables === "SUCCEEDED"} disabled={complete.isPending} onClick={() => complete.mutate("SUCCEEDED")}>
                  شبیه‌سازی پرداخت موفق
                </Button>
                <Button variant="secondary" disabled={complete.isPending} onClick={() => complete.mutate("FAILED")}>شبیه‌سازی پرداخت ناموفق</Button>
                <Button variant="ghost" disabled={complete.isPending} onClick={() => complete.mutate("CANCELED")}>انصراف</Button>
              </div>
            ) : (
              <Alert tone={RESULT[payment.data.status][0]} className="mt-6">{RESULT[payment.data.status][1]}</Alert>
            )}
            <Link href={`/app/${payment.data.organizationId}/billing`} className="mt-6 inline-block text-brand-700 hover:underline">
              بازگشت به صفحه اشتراک
            </Link>
          </>
        )}
      </Card>
    </main>
  );
}
