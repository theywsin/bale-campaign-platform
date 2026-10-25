import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "پلن‌ها و قیمت‌گذاری" };

export default function PricingPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold sm:text-3xl">پلن‌ها و قیمت‌گذاری</h1>
      <Alert tone="info" title="پلن‌های فروش هنوز منتشر نشده‌اند" className="mt-6">
        <p className="leading-7">
          سامانه اشتراک و پرداخت در حال توسعه است. تا زمان انتشار آن، هیچ هزینه‌ای از شما دریافت نمی‌شود و ثبت‌نام برای استفاده آزمایشی از امکانات فعال آزاد است.
          پس از انتشار، قیمت‌ها، مدت اشتراک و امکانات هر پلن در همین صفحه از روی اطلاعات واقعی سامانه نمایش داده می‌شود.
        </p>
      </Alert>
      <Link href="/register" className="mt-8 inline-block rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700">
        ثبت‌نام آزمایشی
      </Link>
    </section>
  );
}
