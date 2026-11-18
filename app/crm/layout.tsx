import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import type { ReactNode } from "react";

import { ROLE_CODES } from "@/lib/auth/constants";
import { getRequestSession } from "@/lib/auth/server";
import { CrmShell } from "@/features/crm-shell/shell";

import "./crm.css";

export const metadata: Metadata = { title: "Rolan PRO CRM" };
export const dynamic = "force-dynamic";

/** The frame of the new interface: one menu and one page layout for every screen. */
export default async function CrmLayout({ children }: { children: ReactNode }) {
  const headerList = await headers();
  const cookieList = await cookies();
  const request = new NextRequest(`https://${headerList.get("host") ?? "localhost"}/crm`, {
    headers: { cookie: cookieList.toString() },
  });
  const session = await getRequestSession(request);
  if (!session) redirect("/login");
  if (!session.roles.includes(ROLE_CODES.OWNER) && !session.roles.includes(ROLE_CODES.MANAGER)) redirect("/legacy-crm");
  if (session.user.must_change_password && !session.preview) redirect("/change-password");

  return (
    <CrmShell role={session.roles.includes(ROLE_CODES.OWNER) ? "owner" : "manager"} userName={session.user.full_name}>
      {children}
    </CrmShell>
  );
}
