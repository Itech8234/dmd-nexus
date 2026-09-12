import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 dark:hover:bg-brand-500 focus-visible:ring-brand-500/40 shadow-sm",
  secondary:
    "bg-white text-slate-700 dark:text-slate-200 border border-surface-line hover:bg-surface-sunken focus-visible:ring-slate-200",
  ghost: "text-slate-600 dark:text-slate-300 hover:bg-surface-sunken focus-visible:ring-slate-200",
  outline:
    "bg-transparent text-slate-700 dark:text-slate-200 border border-slate-300 hover:bg-surface-sunken focus-visible:ring-slate-200",
  danger:
    "bg-red-600 text-white hover:bg-red-700 dark:hover:bg-red-500 focus-visible:ring-red-500/40 shadow-sm",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-sm gap-2",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors
        focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:pointer-events-none
        ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
