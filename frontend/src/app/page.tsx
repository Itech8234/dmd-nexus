"use client";

// DMD Y-COMPS premium landing page (public, shown before the login screen).
// Animated gradient hero, floating orbs, count-up KPIs, scroll reveals and a
// full feature tour — all pure CSS/JS motion, no heavy assets.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  BarChart3,
  Camera,
  ChevronRight,
  ClipboardList,
  Headset,
  Lock,
  MapPin,
  MapPinCheck,
  Menu,
  MessageSquare,
  Radar,
  Radio,
  ShieldCheck,
  Smartphone,
  Siren,
  Sparkles,
  Users,
  Video,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

function useInView<T extends HTMLElement>(threshold = 0.18) {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, visible } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function useCountUp(target: number, start: boolean, duration = 1400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, start, duration]);
  return value;
}

// ---------------------------------------------------------------------------
// KPI counter block
// ---------------------------------------------------------------------------

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  const { ref, visible } = useInView<HTMLDivElement>(0.4);
  const n = useCountUp(value, visible);
  return (
    <div ref={ref} className="text-center">
      <p className="bg-gradient-to-r from-brand-400 to-violet-400 bg-clip-text font-mono text-3xl font-extrabold text-transparent sm:text-4xl">
        {n.toLocaleString()}
        {suffix || ""}
      </p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page sections
// ---------------------------------------------------------------------------

function Navbar({ scrolled }: { scrolled: boolean }) {
  const [open, setOpen] = useState(false);
  const links = [
    { href: "#platform", label: "Platform" },
    { href: "#roles", label: "Who it's for" },
    { href: "#map", label: "Live Map" },
    { href: "#contact", label: "Contact" },
  ];
  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "border-b border-white/10 bg-slate-950/70 backdrop-blur-xl" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-lift">
            <ShieldCheck size={18} />
          </span>
          <span className="text-sm font-extrabold tracking-tight text-white">
            DMD <span className="bg-gradient-to-r from-brand-300 to-violet-300 bg-clip-text text-transparent">Y-COMPS</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-medium text-slate-300 transition-colors hover:text-white">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden items-center gap-1 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-lift transition-transform hover:scale-[1.03] sm:inline-flex"
          >
            Sign in <ChevronRight size={15} />
          </Link>
          <button className="rounded-lg p-2 text-slate-300 md:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-white/10 bg-slate-950/95 px-4 py-4 md:hidden">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/5"
            >
              {l.label}
            </a>
          ))}
          <Link
            href="/login"
            className="mt-3 flex items-center justify-center gap-1 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Sign in <ChevronRight size={15} />
          </Link>
        </div>
      )}
    </header>
  );
}

function Hero() {
  const { ref, visible } = useInView<HTMLDivElement>(0.1);
  return (
    <section className="relative overflow-hidden pt-32 pb-24 sm:pt-40 sm:pb-32">
      {/* Floating orbs */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-[440px] w-[440px] rounded-full bg-brand-600/30 blur-[110px] animate-pulse-soft" />
      <div className="pointer-events-none absolute top-1/3 -right-32 h-[520px] w-[520px] rounded-full bg-violet-600/30 blur-[120px] animate-pulse-soft" style={{ animationDelay: "1.2s" }} />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-fuchsia-600/20 blur-[100px] animate-pulse-soft" style={{ animationDelay: "2.1s" }} />
      {/* Grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.35) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 30%, black, transparent)",
        }}
      />

      <div ref={ref} className={`relative mx-auto max-w-6xl px-4 text-center transition-all duration-700 sm:px-6 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-400/30 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-brand-200">
          <Sparkles size={13} /> Election-Day Operations Console
        </span>
        <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-6xl">
          Run your campaign from{" "}
          <span className="bg-gradient-to-r from-brand-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">one live map</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
          DMD Y-COMPS brings every polling unit, official, report and incident across Yobe State into a
          real-time command centre — with offline field apps, secure chat, video calls and SMS fallback.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/login"
            className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-8 py-3.5 text-sm font-bold text-white shadow-pop transition-all hover:scale-[1.04] hover:shadow-[0_0_48px_rgba(99,102,241,0.45)]"
          >
            Enter command centre <ChevronRight size={16} className="transition-transform group-hover:translate-x-1" />
          </Link>
          <a
            href="#platform"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-8 py-3.5 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/10"
          >
            <Radar size={16} /> Explore the platform
          </a>
        </div>

        <div className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-6 sm:grid-cols-4">
          <Stat label="Polling units" value={2823} />
          <Stat label="Wards" value={178} />
          <Stat label="LGAs" value={17} />
          <Stat label="Offline-safe" value={100} suffix="%" />
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="group rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-brand-400/40 hover:bg-white/[0.07] hover:shadow-[0_16px_48px_-12px_rgba(99,102,241,0.35)]">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/20 to-violet-500/20 text-brand-300 ring-1 ring-brand-400/20 transition-colors group-hover:text-brand-200">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-bold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{desc}</p>
    </div>
  );
}

function Platform() {
  const features = [
    {
      icon: <MapPin size={20} />,
      title: "Live operations map",
      desc: "Every polling unit, colour-coded by status on a modern Carto basemap that follows light & dark mode. Zoom, filter by LGA/ward and open PU details instantly.",
    },
    {
      icon: <Smartphone size={20} />,
      title: "Offline-first field app",
      desc: "Field officials report from anywhere — low signal or none. Everything queues on-device and syncs automatically the moment you're back online.",
    },
    {
      icon: <Siren size={20} />,
      title: "Incident triage",
      desc: "Report, assign, investigate, resolve and close incidents with a full lifecycle timeline. Critical events page the right people by SMS too.",
    },
    {
      icon: <MessageSquare size={20} />,
      title: "Secure chat & video calls",
      desc: "Direct and group conversations between admins, coordinators and officials — with typing indicators, picture attachments and live 1:1 video calls over WebRTC.",
    },
    {
      icon: <Camera size={20} />,
      title: "Photo reports",
      desc: "Attach images to every field report so command sees what your eyes see. Images ride the same offline queue and upload on sync.",
    },
    {
      icon: <BarChart3 size={20} />,
      title: "Command analytics",
      desc: "KPI tiles, per-LGA coverage, reports-per-day charts and sync health — refreshed live over a real-time operations feed.",
    },
    {
      icon: <Radio size={20} />,
      title: "SMS fallback channel",
      desc: "When the data network fails, officials can still text reports and incidents. Every message is logged and reviewed before it counts.",
    },
    {
      icon: <Headset size={20} />,
      title: "Credential emails",
      desc: "New officials, coordinators and admins get their login details delivered instantly to their inbox in a beautiful branded mail.",
    },
    {
      icon: <ShieldCheck size={20} />,
      title: "Audit-grade access",
      desc: "Role-based scoping down to the ward, full audit logging of every privileged action, and geo-scoped dashboards for coordinators.",
    },
  ];

  return (
    <section id="platform" className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <Reveal className="mx-auto max-w-2xl text-center">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-300">Platform</span>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Everything the field needs, <span className="bg-gradient-to-r from-brand-300 to-violet-300 bg-clip-text text-transparent">on one screen</span>
        </h2>
        <p className="mt-4 text-slate-400">
          Purpose-built for campaign operations in Yobe State — from the state command room to a smartphone in a field official's hands.
        </p>
      </Reveal>

      <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f, i) => (
          <Reveal key={f.title} delay={i * 60}>
            <FeatureCard {...f} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Roles() {
  const roles = [
    {
      icon: <Users size={18} />,
      title: "Super & Campaign Admins",
      desc: "Full command centre, user management, geography administration, SMS review, audit logs and global analytics.",
    },
    {
      icon: <MapPinCheck size={18} />,
      title: "LGA Coordinators",
      desc: "A live dashboard scoped to their local government — every ward, unit, report and incident within their area.",
    },
    {
      icon: <ClipboardList size={18} />,
      title: "Ward Coordinators",
      desc: "Ward-level oversight with assignments, unit status and direct chat to the officials on the ground.",
    },
    {
      icon: <Activity size={18} />,
      title: "Field Officials",
      desc: "A mobile-friendly console: report status, log incidents, propose new polling units and message command — offline-safe.",
    },
  ];
  return (
    <section id="roles" className="relative border-t border-white/5 bg-slate-950/60 py-24">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-brand-950/30 to-transparent" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">Who it&apos;s for</span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Every role, one platform</h2>
          <p className="mt-4 text-slate-400">Scoped access for every level of the campaign — from the state command room to the individual polling unit.</p>
        </Reveal>
        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {roles.map((r, i) => (
            <Reveal key={r.title} delay={i * 80}>
              <div className="h-full rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur transition-colors hover:border-violet-400/40">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 text-violet-300 ring-1 ring-violet-400/20">
                  {r.icon}
                </div>
                <h3 className="mt-4 text-sm font-bold text-white">{r.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{r.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function MapPreview() {
  return (
    <section id="map" className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <Reveal>
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-300">Live map</span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            A modern polling-unit map that <span className="bg-gradient-to-r from-brand-300 to-violet-300 bg-clip-text text-transparent">adapts to your theme</span>
          </h2>
          <p className="mt-4 text-slate-400">
            Beautiful Carto basemaps — dark in dark mode, light in light mode — with polling-unit pin indicators,
            status clusters and rich detail popups for every unit.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-slate-300">
            {[
              "Polling-unit icons with PU code, ward and LGA in every popup",
              "Grid clustering so 2,800+ units stay crisp at any zoom",
              "Server-side filters by LGA, ward and operational status",
              "Read-only maps embedded across command, analytics and geography",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <MapPinCheck size={16} className="mt-0.5 shrink-0 text-emerald-400" />
                {t}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={120}>
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-pop">
            {/* Mock map — CSS tiles like a dark basemap */}
            <div
              className="h-72 sm:h-80"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(135deg, rgba(37,72,232,0.08), rgba(124,58,237,0.06))",
                backgroundSize: "40px 40px, 40px 40px, 100% 100%",
                backgroundColor: "rgb(8 11 22)",
              }}
            >
              <div className="absolute left-1/4 top-1/3">
                <div className="relative flex h-8 w-8 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/40" />
                  <span className="relative h-4 w-4 rounded-full bg-emerald-500 ring-2 ring-white/80" />
                </div>
              </div>
              <div className="absolute left-1/2 top-1/4">
                <div className="relative flex h-8 w-8 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500/40" style={{ animationDelay: "0.6s" }} />
                  <span className="relative h-4 w-4 rounded-full bg-blue-500 ring-2 ring-white/80" />
                </div>
              </div>
              <div className="absolute left-2/3 top-1/2">
                <div className="relative flex h-8 w-8 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500/40" style={{ animationDelay: "1.1s" }} />
                  <span className="relative h-4 w-4 rounded-full bg-amber-500 ring-2 ring-white/80" />
                </div>
              </div>
              <div className="absolute left-1/3 top-3/5">
                <div className="relative flex h-8 w-8 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fuchsia-500/40" style={{ animationDelay: "1.7s" }} />
                  <span className="relative h-4 w-4 rounded-full bg-fuchsia-500 ring-2 ring-white/80" />
                </div>
              </div>
              <div className="absolute bottom-4 left-4 rounded-xl border border-white/10 bg-slate-900/90 px-4 py-3 backdrop-blur">
                <p className="font-mono text-[10px] text-slate-400">35/04/01/006</p>
                <p className="text-xs font-semibold text-white">Kukar Gadu Pri. Sch. I</p>
                <p className="mt-0.5 text-[10px] text-emerald-400">● Active · Fika LGA</p>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-white/10 bg-slate-950 px-5 py-4">
              <p className="text-xs text-slate-400">
                <span className="font-semibold text-white">Operations Map</span> · Yobe State, Nigeria
              </p>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> LIVE
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section id="contact" className="relative border-t border-white/5 py-24">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-brand-600/25 to-violet-600/25 blur-[120px]" />
      </div>
      <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-1.5 text-xs font-semibold text-violet-200">
          <Video size={13} /> Ready when you are
        </span>
        <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Step into the command centre
        </h2>
        <p className="mt-4 text-slate-400">
          Every polling unit in Yobe, every official, every report — live and in sync. Sign in to open your dashboard.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/login"
            className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-8 py-3.5 text-sm font-bold text-white shadow-pop transition-all hover:scale-[1.04] hover:shadow-[0_0_48px_rgba(99,102,241,0.45)]"
          >
            <Lock size={15} /> Sign in to Y-COMPS <ChevronRight size={16} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 bg-slate-950 py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 text-white">
            <ShieldCheck size={15} />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold text-white">DMD Y-COMPS</p>
            <p className="text-[11px] text-slate-500">Yobe Campaign Operations &amp; Monitoring Platform</p>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          &copy; {new Date().getFullYear()} DMD · Built for Yobe State, Nigeria
        </p>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <a href="#platform" className="hover:text-white">Platform</a>
          <a href="#roles" className="hover:text-white">Roles</a>
          <Link href="/login" className="hover:text-white">Sign in</Link>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased [font-feature-settings:'ss01']">
      <Navbar scrolled={scrolled} />
      <main className="overflow-hidden">
        <Hero />
        <Platform />
        <Roles />
        <MapPreview />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}