import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import "./proposal-premium.css";
import { PwaRegistration } from "@/components/pwa-registration";

export const metadata: Metadata = {
  title: "Rolan PRO CRM",
  description: "Рабочая CRM сотрудников Rolan PRO",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  // "default" keeps the page below the iPhone clock and battery once the CRM is
  // installed: "black-translucent" drew the top bar of the new interface under them.
  appleWebApp: { capable: true, title: "Rolan PRO", statusBarStyle: "default" },
  // Next.js writes only the new "mobile-web-app-capable"; iPhones before iOS 16.4
  // open a home-screen icon as an app only with the Apple name.
  other: { "apple-mobile-web-app-capable": "yes" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ru">
      <body><PwaRegistration />{children}</body>
    </html>
  );
}
