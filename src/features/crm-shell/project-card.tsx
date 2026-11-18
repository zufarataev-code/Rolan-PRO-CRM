"use client";

import Link from "next/link";

import { dateTime, money } from "@/features/crm-shell/format";
import type { CrmProjectCard } from "@/features/crm-shell/types";
import { Pill, UrgencyPill } from "@/features/crm-shell/ui";

/** One project in the funnel: who, how much, what is next. */
export function ProjectCard({ card }: { card: CrmProjectCard }) {
  const servicePct = card.services ? Math.round((100 * card.servicesDone) / card.services) : 0;
  return (
    <Link
      href={`/crm/projects/${encodeURIComponent(card.id)}`}
      className="bg-card hover:border-primary/50 block rounded-lg border p-3 shadow-xs transition-colors"
      style={card.accent?.color ? { borderLeftColor: card.accent.color, borderLeftWidth: 3 } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <b className="min-w-0 truncate text-sm">{card.client}</b>
        {card.sum > 0 ? <span className="shrink-0 text-sm font-bold tabular-nums">{money(card.sum)}</span> : null}
      </div>
      <div className="text-muted-foreground mt-0.5 truncate text-xs">
        {card.number}
        {card.address ? ` · ${card.address}` : ""}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Pill>{card.status}</Pill>
        <UrgencyPill label={card.urgency} />
        {card.debt > 0 && card.paid > 0 ? <Pill tone="warn">долг {money(card.debt)}</Pill> : null}
      </div>
      {card.installationAt ? <div className="text-muted-foreground mt-2 text-xs">Монтаж: {dateTime(card.installationAt)}</div> : null}
      {card.services > 0 ? (
        <div className="mt-2 flex items-center gap-2">
          <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
            <div className="bg-primary h-full rounded-full" style={{ width: `${servicePct}%` }} />
          </div>
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {card.servicesDone}/{card.services}
          </span>
        </div>
      ) : null}
      {card.next ? <div className="text-primary mt-2 truncate text-xs font-semibold">→ {card.next}</div> : null}
    </Link>
  );
}
