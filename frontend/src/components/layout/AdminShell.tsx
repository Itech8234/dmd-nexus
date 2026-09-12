"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Search,
  ChevronsUpDown,
  LogOut,
  Menu,
  X,
} from "lucide-react";

import { adminNav, navSections } from "./nav";
import { NotificationCenter } from "./NotificationCenter";
import { useAuth } from "@/lib/auth";
import { GlobalSearch } from "./GlobalSearch";
import { ConnectionBadge, SyncBadge } from "./Badges";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ROLE_LABELS } from "@/lib/format";
import { useNotificationStream } from "@/hooks/useNotificationStream";
import { onForegroundPush, registerPush, resetPushRegistration } from "@/lib/push";


function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
        YC
      </div>

      <div className="leading-tight">
        <p className="text-sm font-bold text-ink">
          Y-COMPS
        </p>

        <p className="text-[11px] text-slate-500">
          Command Centre
        </p>
      </div>
    </div>
  );
}


export function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const {
    user,
    isPrivileged,
    logout,
  } = useAuth();

  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  /**
   * One shared notification stream: badge count, list, reconnect + dedupe.
   * The NotificationCenter renders the bell + dropdown from this state.
   */
  const notifications = useNotificationStream();

  /**
   * Web-push (FCM) tray notifications. Registers this browser's token once
   * and refreshes the bell when a push arrives while the tab is focused.
   */
  useEffect(() => {
    registerPush();

    let unsub: (() => void) | undefined;
    onForegroundPush(notifications.onRefresh).then((u) => (unsub = u));
    return () => unsub?.();
  }, [notifications.onRefresh]);


  /**
   * Close drawer with Escape
   */
  useEffect(() => {
    if (!drawerOpen) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);


  /**
   * Ctrl + K / Cmd + K
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        setSearchOpen((value) => !value);
      }
    };

    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);


  /**
   * Filter navigation based on user role
   */
  const sections = navSections(
    adminNav.filter(
      (item) =>
        !item.roles ||
        item.roles.includes(user?.role || "")
    )
  );


  /**
   * Determine active navigation item
   */
  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }

    return (
      pathname === href ||
      pathname.startsWith(`${href}/`)
    );
  };


  return (
    <div className="min-h-screen bg-surface">

      {/* Global Search */}
      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />


      {/* Drawer Backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[2px] animate-fade-in"
          onClick={() => setDrawerOpen(false)}
        />
      )}


      {/* Navigation Drawer */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50
          flex w-72 flex-col
          border-r border-surface-line
          bg-white
          shadow-pop
          transition-transform
          duration-300
          ${
            drawerOpen
              ? "translate-x-0"
              : "-translate-x-full"
          }
        `}
        aria-label="Admin navigation"
      >

        {/* Drawer Header */}
        <div className="flex items-center justify-between pr-3">

          <Brand />

          <button
            onClick={() => setDrawerOpen(false)}
            className="rounded-lg p-2 text-slate-400 hover:bg-surface-sunken hover:text-ink"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>

        </div>


        {/* Navigation */}
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">

          {sections.map((group) => (

            <div
              key={group.section}
              className="mb-3"
            >

              {/* Section Title */}
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {group.section}
              </p>


              {/* Navigation Items */}
              {group.items.map((item) => {

                const active = isActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setDrawerOpen(false)}

                    className={`
                      flex items-center gap-3
                      rounded-lg
                      px-3 py-2
                      text-sm font-medium
                      transition-colors

                      ${
                        active
                          ? "bg-brand-50 text-brand-700 dark:bg-brand-100/10 dark:text-brand-400"
                          : "text-slate-600 hover:bg-surface-sunken hover:text-ink"
                      }
                    `}
                  >

                    <item.icon
                      size={17}
                      className="shrink-0"
                    />

                    <span>
                      {item.label}
                    </span>

                  </Link>
                );

              })}

            </div>

          ))}

        </nav>


        {/* Logout */}
        <div className="border-t border-surface-line p-3">

          <button
            onClick={logout}

            className="
              flex w-full items-center gap-3
              rounded-lg
              px-3 py-2
              text-sm text-slate-500
              hover:bg-surface-sunken
              hover:text-red-600
            "
          >
            <LogOut size={17} />

            Sign out

          </button>

        </div>

      </aside>


      {/* Main Application */}
      <div className="flex min-h-screen flex-col">


        {/* Header */}
        <header
          className="
            sticky top-0 z-30
            flex h-14
            items-center justify-between
            gap-3
            border-b border-surface-line
            bg-white/90
            px-4
            backdrop-blur
          "
        >

          {/* Left Header */}
          <div className="flex items-center gap-2">

            {/* Hamburger */}
            <button
              className="
                rounded-lg p-2
                text-slate-500
                hover:bg-surface-sunken
              "
              onClick={() =>
                setDrawerOpen((value) => !value)
              }
              aria-label="Toggle menu"
            >

              {drawerOpen ? (
                <X size={18} />
              ) : (
                <Menu size={18} />
              )}

            </button>


            {/* Search */}
            <button
              onClick={() => setSearchOpen(true)}

              className="
                hidden sm:flex
                items-center gap-2
                rounded-lg
                border border-surface-line
                bg-surface-sunken/50
                px-3 py-1.5
                text-sm text-slate-500
                hover:bg-surface-sunken
              "
            >

              <Search size={15} />

              Search…

              <kbd
                className="
                  ml-6
                  rounded
                  border border-surface-line
                  bg-white
                  px-1.5
                  text-[10px]
                  text-slate-400
                "
              >
                Ctrl K
              </kbd>

            </button>

          </div>


          {/* Right Header */}
          <div className="flex items-center gap-2">

            <ConnectionBadge />

            <SyncBadge />

            <ThemeToggle />


            {/* Notifications */}
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


            {/* User Menu */}
            <div className="relative">

              <button
                onClick={() =>
                  setMenuOpen((value) => !value)
                }

                className="
                  flex items-center gap-2
                  rounded-lg
                  px-2 py-1.5
                  hover:bg-surface-sunken
                "
              >

                {/* Avatar */}
                <span
                  className="
                    flex h-7 w-7
                    items-center justify-center
                    rounded-full
                    bg-brand-600
                    text-xs font-semibold
                    text-white
                  "
                >

                  {(
                    user?.first_name?.[0] ||
                    user?.username?.[0] ||
                    "?"
                  ).toUpperCase()}

                </span>


                {/* User Information */}
                <span className="hidden text-left leading-tight md:block">

                  <span className="block text-xs font-semibold text-ink">

                    {user?.first_name} {user?.last_name}

                  </span>


                  <span className="block text-[10px] text-slate-500">

                    {user
                      ? ROLE_LABELS[user.role] ||
                        user.role
                      : ""}

                  </span>

                </span>


                <ChevronsUpDown
                  size={14}
                  className="
                    hidden
                    text-slate-400
                    md:block
                  "
                />

              </button>


              {/* Dropdown */}
              {menuOpen && (
                <>

                  {/* Dropdown Backdrop */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() =>
                      setMenuOpen(false)
                    }
                  />


                  {/* Menu */}
                  <div
                    className="
                      absolute right-0 z-20
                      mt-1 w-52
                      rounded-lg
                      border border-surface-line
                      bg-white
                      py-1
                      shadow-pop
                      animate-scale-in
                    "
                  >

                    {/* User Details */}
                    <div
                      className="
                        border-b border-surface-line
                        px-3 py-2
                      "
                    >

                      <p className="text-sm font-semibold text-ink">

                        {user?.first_name} {user?.last_name}

                      </p>


                      <p className="text-xs text-slate-500">

                        {user?.email ||
                          user?.username}

                      </p>

                    </div>


                    {/* Settings */}
                    {isPrivileged && (

                      <Link
                        href="/settings"

                        onClick={() =>
                          setMenuOpen(false)
                        }

                        className="
                          block
                          px-3 py-2
                          text-sm text-slate-600
                          hover:bg-surface-sunken
                        "
                      >

                        Settings

                      </Link>

                    )}


                    {/* Sign Out */}
                    <button
                      onClick={() => {
                        resetPushRegistration();
                        logout();
                      }}

                      className="
                        flex w-full
                        items-center gap-2
                        px-3 py-2
                        text-sm
                        text-red-600
                        hover:bg-red-50
                        dark:text-red-400
                      "
                    >

                      <LogOut size={15} />

                      Sign out

                    </button>

                  </div>

                </>
              )}

            </div>

          </div>

        </header>


        {/* Main Content */}
        <main className="flex-1 px-4 py-6 sm:px-6">

          <div className="mx-auto max-w-7xl">

            {children}

          </div>

        </main>

      </div>

    </div>
  );
}