"use client";

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

function useLockBody(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
}

function ModalShell({
  open,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  labelledBy?: string;
}) {
  useLockBody(open);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-pop animate-scale-in max-h-[92vh] sm:max-h-[86vh] flex flex-col">
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <ModalShell open={open} onClose={onClose} labelledBy="modal-title">
      <div className="flex items-center justify-between px-5 py-4 border-b border-surface-line">
        <h2 id="modal-title" className="text-base font-semibold text-ink">
          {title}
        </h2>
        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-surface-sunken hover:text-ink" aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className="px-5 py-4 overflow-y-auto">{children}</div>
      {footer && <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-surface-line">{footer}</div>}
    </ModalShell>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useLockBody(open);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-pop animate-slide-in-right flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-line">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-surface-sunken hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-surface-line">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}
