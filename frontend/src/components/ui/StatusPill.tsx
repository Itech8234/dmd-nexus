import React from "react";
import { STATUS_TONES } from "@/lib/format";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "violent";

interface StatusPillProps {
  tone?: Tone;
  label: string;
  dot?: boolean;
  className?: string;
}

export function StatusPill({ tone = "neutral", label, dot = true, className = "" }: StatusPillProps) {
  const t = STATUS_TONES[tone] || STATUS_TONES.neutral;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${t.bg} ${t.text} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />}
      {label}
    </span>
  );
}

export { STATUS_TONES };
