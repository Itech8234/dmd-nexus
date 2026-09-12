"use client";

import { ReactNode } from "react";
import { FieldShell } from "@/components/layout";
import { Protected } from "@/components/auth/Protected";

export default function FieldLayout({ children }: { children: ReactNode }) {
  return (
    <Protected role="field">
      <FieldShell>{children}</FieldShell>
    </Protected>
  );
}
