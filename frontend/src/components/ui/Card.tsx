import React from "react";

export function Card({
  title,
  icon,
  actions,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`bg-white rounded-xl border border-surface-line shadow-card ${className}`}
    >
      {title && (
        <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-surface-line">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            {icon}
            {title}
          </h3>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
