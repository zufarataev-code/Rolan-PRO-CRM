"use client";

import type { ReactNode } from "react";
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** The same heading on every screen: title, one line of context, actions on the right. */
export function PageHeader({ title, sub, loading, onReload, children }: { title: string; sub?: string; loading?: boolean; onReload?: () => void; children?: ReactNode }) {
  return (
    <header className="mb-4 flex flex-wrap items-center gap-3 lg:mb-6">
      <div className="mr-auto min-w-0">
        <h1 className="truncate text-xl font-bold tracking-tight lg:text-2xl">{title}</h1>
        {sub ? <p className="text-muted-foreground mt-0.5 text-sm">{sub}</p> : null}
      </div>
      {children}
      {onReload ? (
        <Button variant="outline" size="icon" aria-label="Обновить" disabled={loading} onClick={onReload}>
          {loading ? <Spinner /> : <RefreshCwIcon />}
        </Button>
      ) : null}
    </header>
  );
}

export function LoadError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" className="mb-4">
      <TriangleAlertIcon />
      <AlertTitle>Данные не загрузились</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function LoadingBlock() {
  return (
    <div className="text-muted-foreground flex items-center justify-center gap-2 py-16 text-sm">
      <Spinner /> Загружаю…
    </div>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("text-muted-foreground text-[11px] font-semibold tracking-[0.13em] uppercase", className)}>{children}</h2>;
}

/** The ring card of the approved demo: a share, a headline number and one line under it. */
export function RingCard({ pct, title, sub, color = "var(--primary)" }: { pct: number; title: string; sub: string; color?: string }) {
  const value = Math.max(0, Math.min(100, Number(pct) || 0));
  const length = 2 * Math.PI * 27;
  return (
    <Card className="py-4">
      <CardContent className="flex items-center gap-3 px-4">
        <div className="relative size-[66px] shrink-0">
          <svg width="66" height="66" viewBox="0 0 66 66" aria-hidden="true">
            <circle cx="33" cy="33" r="27" fill="none" stroke="var(--muted)" strokeWidth="6" />
            <circle cx="33" cy="33" r="27" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(length * value) / 100} ${length}`} transform="rotate(-90 33 33)" />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold tabular-nums">{value}%</span>
        </div>
        <div className="min-w-0">
          <div className="truncate text-lg leading-tight font-bold tabular-nums">{title}</div>
          <div className="text-muted-foreground text-xs leading-snug">{sub}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function Pill({ tone = "muted", children }: { tone?: "muted" | "ok" | "warn" | "info" | "danger"; children: ReactNode }) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    ok: "bg-success/10 text-success",
    warn: "bg-warning/10 text-warning",
    info: "bg-info/10 text-info",
    danger: "bg-destructive/10 text-destructive",
  } as const;
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", tones[tone])}>{children}</span>;
}

/** «Ближайший монтаж» is a reminder, the rest (overdue, debt) is a problem. */
export function UrgencyPill({ label }: { label: string }) {
  if (!label) return null;
  return <Pill tone={label.startsWith("Ближайший") ? "warn" : "danger"}>{label}</Pill>;
}
