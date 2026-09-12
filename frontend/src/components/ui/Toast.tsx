"use client";

import React, { createContext, useContext, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle, AlertTriangle, XCircle, Info, X } from "lucide-react";

type ToastKind = "success" | "error" | "info" | "warning";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<{ push: (kind: ToastKind, message: string) => void } | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  const icons = {
    success: <CheckCircle size={18} className="text-emerald-500" />,
    error: <XCircle size={18} className="text-red-500" />,
    warning: <AlertTriangle size={18} className="text-amber-500" />,
    info: <Info size={18} className="text-blue-500" />,
  };

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm pointer-events-none">
            {toasts.map((t) => (
              <div
                key={t.id}
                className="pointer-events-auto flex items-start gap-3 rounded-lg border border-surface-line bg-white px-4 py-3 shadow-pop animate-scale-in"
                role="status"
              >
                <span className="mt-0.5 shrink-0">{icons[t.kind]}</span>
                <p className="flex-1 text-sm text-ink">{t.message}</p>
                <button
                  onClick={() => dismiss(t.id)}
                  className="shrink-0 text-slate-400 hover:text-ink"
                  aria-label="Dismiss"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
