import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { Button } from "./button";

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="flex items-center justify-between gap-3 pt-4 text-sm text-slate-600" aria-label="صفحه‌بندی">
      <span>
        {formatNumber(total)} مورد — صفحه {formatNumber(page)} از {formatNumber(pages)}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronRight className="size-4" aria-hidden="true" />
          قبلی
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          بعدی
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
