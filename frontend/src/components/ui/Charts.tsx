"use client";

import React, { useMemo } from "react";

// Lightweight, dependency-free SVG charts. Real data only; no chart library
// is needed for command-centre aggregates.

export function SimpleBarChart({
  data,
  height = 180,
}: {
  data: { label: string; value: number }[];
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-2">
            <div className="w-full flex items-end justify-center" style={{ height: height - 22 }}>
              <div
                className="w-full max-w-[28px] rounded-t bg-brand-500/80 hover:bg-brand-600 transition-colors"
                style={{ height: `${Math.max(4, (d.value / max) * 100)}%` }}
                title={`${d.label}: ${d.value}`}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center text-[10px] text-slate-500 truncate" title={d.label}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DonutChart({
  segments,
  size = 160,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
}) {
  const { total, cumulative } = useMemo(() => {
    const t = segments.reduce((s, x) => s + x.value, 0);
    let acc = 0;
    const cum = segments.map((s) => {
      const start = acc;
      acc += s.value;
      return { start, end: acc };
    });
    return { total: Math.max(1, t), cumulative: cum };
  }, [segments]);

  const stroke = 22;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0">
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef1f6" strokeWidth={stroke} />
          {segments.map((s, i) => {
            if (s.value === 0) return null;
            const len = (s.value / total) * circ;
            const offset = (cumulative[i].start / total) * circ;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={`${Math.max(0, len - 2)} ${circ - Math.max(0, len - 2)}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-xl font-bold text-ink">{total}</p>
            <p className="text-[10px] text-slate-500">Total</p>
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="text-slate-600 flex-1">{s.label}</span>
            <span className="font-semibold text-ink">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
