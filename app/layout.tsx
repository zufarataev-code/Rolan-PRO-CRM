import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import "./proposal-premium.css";
import { PwaRegistration } from "@/components/pwa-registration";
import { GlobalVoiceInput } from "@/components/global-voice-input";

export const metadata: Metadata = {
  title: "Rolan PRO CRM",
  description: "Рабочая CRM сотрудников Rolan PRO",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Rolan PRO", statusBarStyle: "black-translucent" },
  icons: { icon: "/rolanpro-app-icon.svg", apple: "/rolanpro-app-icon.svg" },
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ru">
      <body><PwaRegistration /><GlobalVoiceInput />{children}</body>
    </html>
  );
}
