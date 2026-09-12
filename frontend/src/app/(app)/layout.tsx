"use client";

import { useEffect, ReactNode } from "react";
import { AdminShell } from "@/components/layout";
import { Protected } from "@/components/auth/Protected";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Protected role="admin">
      <AdminShell>{children}</AdminShell>
    </Protected>
  );
}
