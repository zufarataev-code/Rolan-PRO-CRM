import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./field.css";

export const metadata: Metadata = { title: "Замеры — Rolan PRO CRM" };

export default function FieldLayout({ children }: { children: ReactNode }) {
  return <div className="rp-field bg-background text-foreground min-h-screen font-sans text-base antialiased">{children}</div>;
}
