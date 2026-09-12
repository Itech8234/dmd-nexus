import type { Metadata, Viewport } from "next";
import "./globals.css";
import type { ReactNode } from "react";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Y-COMPS — Yobe Campaign Operations",
  description: "DMD Y-COMPS: Yobe Campaign Operations & Monitoring Platform",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Y-COMPS",
  },
};

export const viewport: Viewport = {
  themeColor: "#2548e8",
  width: "device-width",
  initialScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Applies the persisted theme (or the OS preference) before first paint so
  // the app never flashes the wrong theme. Mirrors src/lib/theme.tsx.
  const themeBoot = `(function(){try{var m=localStorage.getItem("ycomps.theme")||"system";var d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        {/* eslint-disable @next/next/no-page-custom-font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* eslint-enable @next/next/no-page-custom-font */}
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
