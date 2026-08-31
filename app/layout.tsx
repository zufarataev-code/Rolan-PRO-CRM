import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import "./proposal-premium.css";

export const metadata: Metadata = {
  title: "ROLANPRO System",
  description: "ROLANPRO CRM / ERP foundation",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
