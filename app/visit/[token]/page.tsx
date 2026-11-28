import { notFound } from "next/navigation";

import { PublicVisitCard } from "@/components/public-visit-card";
import { orderIdFromVisitToken } from "@/features/visits/visit-token";

type PageProps = { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string }> };

export const dynamic = "force-dynamic";

/** The client's link from a visit notification (Owner, 2026-11-27): who comes, when, and «Перенести». */
export default async function ClientVisitPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { lang } = await searchParams;
  if (!orderIdFromVisitToken(token)) notFound();
  return (
    <main className="landing-shell proposal-page-shell" style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ fontWeight: 900, letterSpacing: 1, marginBottom: 12 }}>ROLAN PRO</div>
      <PublicVisitCard accessToken={token} apiPath={`/api/public/visits/${encodeURIComponent(token)}`} language={lang === "ru" ? "ru" : "en"} standalone />
    </main>
  );
}
