import React, { forwardRef } from "react";

const base =
  "w-full rounded-lg border border-surface-line bg-white px-3 text-sm text-ink placeholder:text-slate-400 " +
  "focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 " +
  "disabled:bg-surface-sunken disabled:text-slate-400";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...rest }, ref) {
    return <input ref={ref} className={`${base} h-10 ${className}`} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", children, ...rest }, ref) {
    return (
      <select ref={ref} className={`${base} h-10 ${className}`} {...rest}>
        {children}
      </select>
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = "", ...rest }, ref) {
  return <textarea ref={ref} className={`${base} py-2.5 min-h-[88px] ${className}`} {...rest} />;
});

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5" htmlFor={htmlFor}>
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && !error && <span className="text-[11px] text-slate-400">{hint}</span>}
      {error && <span className="text-[11px] text-red-600 dark:text-red-400">{error}</span>}
    </label>
  );
}
