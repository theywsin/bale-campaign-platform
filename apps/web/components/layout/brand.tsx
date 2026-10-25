import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-extrabold text-slate-900">
      <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-brand-600 text-white">
        ب
      </span>
      <span>بله‌کمپین</span>
    </Link>
  );
}
