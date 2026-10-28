import type { Metadata } from "next";
import { PricingList } from "./pricing-list";

export const metadata: Metadata = { title: "پلن‌ها و قیمت‌گذاری" };

export default function PricingPage() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-bold sm:text-3xl">پلن‌ها و قیمت‌گذاری</h1>
      <p className="mt-3 leading-7 text-slate-600">قیمت‌ها به ریال و برای هر دوره است. سقف‌ها برای هر فضای کاری اعمال می‌شود.</p>
      <PricingList />
    </section>
  );
}
