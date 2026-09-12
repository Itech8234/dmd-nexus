"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { fieldNav } from "./nav";
import { NotificationCenter } from "./NotificationCenter";
import { ConnectionBadge, SyncBadge } from "./Badges";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useAuth } from "@/lib/auth";
import { useNotificationStream } from "@/hooks/useNotificationStream";
import { onForegroundPush, registerPush, resetPushRegistration } from "@/lib/push";

export function FieldShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const notifications = useNotificationStream();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  /**
   * Web-push (FCM) tray notifications — so an official hears about a new
   * message/report even when the app is closed. Best-effort: silently
   * skipped when Firebase isn't configured or permission is denied.
   */
  useEffect(() => {
    registerPush();

    let unsub: (() => void) | undefined;
    onForegroundPush(notifications.onRefresh).then((u) => (unsub = u));
    return () => unsub?.();
  }, [notifications.onRefresh]);

  return (
    <div className="min-h-screen bg-surface flex flex-col max-w-md mx-auto">
      <header className="sticky top-0 z-20 bg-white border-b border-surface-line px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white font-bold text-xs">
            YC
          </div>
          <p className="text-sm font-bold text-ink">Y-COMPS Field</p>
        </div>
        <div className="flex items-center gap-1.5">
          <ConnectionBadge />
          <ThemeToggle />
          <NotificationCenter
            unread={notifications.unread}
            items={notifications.items}
            itemsLoaded={notifications.itemsLoaded}
            status={notifications.status}
            onMarkAllRead={notifications.onMarkAllRead}
            onRemove={notifications.onRemove}
            onClearAll={notifications.onClearAll}
            onRefresh={notifications.onRefresh}
          />
          <button
            onClick={() => {
              resetPushRegistration();
              logout();
            }}
            className="text-xs text-slate-500 hover:text-red-600 dark:hover:text-red-400 px-2 py-1"
            aria-label="Sign out"
          >
            {user?.first_name ? user.first_name.split(" ")[0] : ""} · out
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-24">{children}</main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 z-20 w-full max-w-md bg-white border-t border-surface-line px-2 py-1.5">
        <div className="flex items-stretch justify-between">
          {fieldNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium ${
                isActive(item.href) ? "text-brand-700" : "text-slate-500"
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          ))}
          <div className="flex-shrink-0 px-1 py-1.5">
            <SyncBadge />
          </div>
        </div>
      </nav>
    </div>
  );
}
