import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({
  page,
  totalPages,
  count,
  pageSize,
  onChange,
}: {
  page: number;
  totalPages: number;
  count: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1 && count <= pageSize) return null;
  const from = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, count);
  return (
    <div className="flex items-center justify-between border-t border-surface-line px-5 py-3">
      <p className="text-xs text-slate-500">
        {from}–{to} of {count}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-surface-sunken disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="px-2 text-xs text-slate-500">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-surface-sunken disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
