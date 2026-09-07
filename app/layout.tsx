import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import "./proposal-premium.css";
import { PwaRegistration } from "@/components/pwa-registration";

export const metadata: Metadata = {
  title: "Rolan PRO CRM",
  description: "Рабочая CRM сотрудников Rolan PRO",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Rolan PRO", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
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
