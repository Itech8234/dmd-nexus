import React from "react";
import { Inbox } from "lucide-react";

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-label="Loading">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-shimmer rounded-md bg-gradient-to-r from-surface-sunken via-slate-200 to-surface-sunken bg-[length:200%_100%] ${className}`}
    />
  );
}

export function SkeletonRows({ rows = 6, height = "h-5" }: { rows?: number; height?: string }) {
  return (
    <div className="space-y-3 p-6">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={`${height} w-full`} />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 px-6 text-center animate-fade-in">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-sunken text-slate-400">
        {icon || <Inbox size={22} />}
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        {description && <p className="mt-1 text-xs text-slate-500 max-w-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this information. Try again.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-500">!</div>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 rounded-lg border border-surface-line px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-surface-sunken"
        >
          Try again
        </button>
      )}
    </div>
  );
}
