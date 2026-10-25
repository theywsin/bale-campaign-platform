export function Prose({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
      {updated && <p className="mt-2 text-sm text-slate-500">آخرین به‌روزرسانی: {updated}</p>}
      <div className="mt-8 space-y-6 leading-8 text-slate-700 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900 [&_li]:mr-5 [&_ul]:list-disc [&_ul]:space-y-1">
        {children}
      </div>
    </article>
  );
}
