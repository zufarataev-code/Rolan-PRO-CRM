"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, MapPinIcon, UsersIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CALENDAR_KINDS, calendarDays, dayParts, rangeLabel, shiftAnchor, todayKey, type CalendarMode } from "@/features/crm-shell/calendar";
import type { CrmCalendar, CrmCalendarEvent } from "@/features/crm-shell/types";
import { LoadError, LoadingBlock, PageHeader } from "@/features/crm-shell/ui";
import { useCrmData } from "@/features/crm-shell/use-crm-data";
import { cn } from "@/lib/utils";

function EventCard({ event, compact }: { event: CrmCalendarEvent; compact?: boolean }) {
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <b className="min-w-0 truncate text-xs" style={{ color: event.color }}>
          {event.title}
        </b>
        <span className="shrink-0 text-xs font-semibold tabular-nums">{event.time}</span>
      </div>
      <div className="mt-0.5 truncate text-sm font-semibold">{event.client}</div>
      {event.note ? <div className="text-muted-foreground truncate text-xs">{event.note}</div> : null}
      <div className="text-muted-foreground mt-1 flex items-start gap-1 text-xs">
        <UsersIcon className="mt-0.5 size-3 shrink-0" />
        <span className={cn(compact && "line-clamp-2")}>{event.people}</span>
      </div>
      {event.address ? (
        <div className="text-muted-foreground mt-0.5 flex items-start gap-1 text-xs">
          <MapPinIcon className="mt-0.5 size-3 shrink-0" />
          <span className={cn(compact && "line-clamp-2")}>{event.address}</span>
        </div>
      ) : null}
    </>
  );
  const className = "bg-card block rounded-lg border p-2.5 shadow-xs transition-colors";
  const style = { borderLeftColor: event.color, borderLeftWidth: 3 };
  // A consultation booked from a lead has no project to open yet.
  if (!event.projectId) return <div className={className} style={style}>{body}</div>;
  return (
    <Link href={`/crm/projects/${encodeURIComponent(event.projectId)}`} className={cn(className, "hover:border-primary/50")} style={style}>
      {body}
    </Link>
  );
}

function DayList({ events, empty }: { events: CrmCalendarEvent[]; empty: string }) {
  if (!events.length) return <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-xs">{empty}</p>;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
      {events.map((event) => (
        <EventCard key={event.id} event={event} compact />
      ))}
    </div>
  );
}

export default function CrmCalendarPage() {
  const [mode, setMode] = useState<CalendarMode>("week");
  const [anchor, setAnchor] = useState(() => todayKey());
  const [selected, setSelected] = useState(() => todayKey());
  const [kind, setKind] = useState("all");
  const days = useMemo(() => calendarDays(anchor, mode), [anchor, mode]);
  const { data, error, loading, reload } = useCrmData<CrmCalendar>(`/api/v1/crm-ui/calendar?from=${days[0]}&to=${days[days.length - 1]}`);
  const today = data?.today ?? todayKey();

  const byDay = useMemo(() => {
    const map = new Map<string, CrmCalendarEvent[]>();
    for (const event of data?.events ?? []) {
      if (kind !== "all" && event.kind !== kind) continue;
      map.set(event.day, [...(map.get(event.day) ?? []), event]);
    }
    return map;
  }, [data, kind]);
  const total = [...byDay.values()].reduce((sum, list) => sum + list.length, 0);
  const selectedDay = days.includes(selected) ? selected : days.includes(today) ? today : days[0];

  const move = (direction: 1 | -1) => setAnchor(shiftAnchor(anchor, mode, direction));
  const goToday = () => {
    setAnchor(todayKey());
    setSelected(todayKey());
  };

  return (
    <>
      <PageHeader title="Календарь" sub={`${rangeLabel(days, anchor, mode)} · событий: ${total}`} loading={loading} onReload={() => void reload()}>
        <Button asChild variant="outline">
          <Link href="/crm/section/calendar">Прежний экран</Link>
        </Button>
      </PageHeader>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Назад" onClick={() => move(-1)}>
            <ChevronLeftIcon />
          </Button>
          <Button variant="outline" onClick={goToday}>
            Сегодня
          </Button>
          <Button variant="outline" size="icon" aria-label="Вперёд" onClick={() => move(1)}>
            <ChevronRightIcon />
          </Button>
        </div>
        <div className="bg-muted ml-auto flex rounded-lg p-1" role="group" aria-label="Период">
          {(["week", "month"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={cn("min-h-8 rounded-md px-3 text-sm font-semibold", mode === value ? "bg-card shadow-xs" : "text-muted-foreground")}
            >
              {value === "week" ? "Неделя" : "Месяц"}
            </button>
          ))}
        </div>
      </div>

      <div className="no-scrollbar -mx-3 mb-4 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:flex-wrap lg:px-0" role="tablist" aria-label="Тип события">
        {CALENDAR_KINDS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            role="tab"
            aria-selected={kind === chip.id}
            onClick={() => setKind(chip.id)}
            className={cn("min-h-9 shrink-0 rounded-full border px-3 text-sm font-semibold", kind === chip.id ? "bg-primary text-primary-foreground border-primary" : "bg-card")}
          >
            {chip.title}
          </button>
        ))}
      </div>

      <LoadError message={error} />
      {!data && loading ? <LoadingBlock /> : null}
      {data ? (
        <>
          {/* Days: a strip on a phone and in the month view; the week on a computer is seven columns. */}
          {mode === "month" ? (
            <div className="text-muted-foreground mb-1 hidden grid-cols-7 gap-1 px-1.5 text-[11px] font-semibold uppercase lg:grid">
              {days.slice(0, 7).map((day) => (
                <span key={day}>{dayParts(day).weekday}</span>
              ))}
            </div>
          ) : null}
          <div className={cn("mb-4 grid grid-cols-7 gap-1", mode === "week" && "lg:hidden")}>
            {days.map((day) => {
              const parts = dayParts(day);
              const events = byDay.get(day) ?? [];
              const outside = mode === "month" && day.slice(0, 7) !== anchor.slice(0, 7);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={day === selectedDay}
                  aria-label={`${parts.long}, событий: ${events.length}`}
                  onClick={() => setSelected(day)}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg border text-center lg:min-h-20 lg:items-stretch lg:justify-start lg:p-1.5 lg:text-left",
                    day === selectedDay ? "border-primary bg-accent" : "bg-card",
                    outside && "opacity-45",
                  )}
                >
                  <span className="text-muted-foreground text-[10px] uppercase lg:hidden">{parts.weekday}</span>
                  <span className={cn("text-sm font-bold tabular-nums", day === today && "bg-primary text-primary-foreground rounded-full px-1.5")}>{parts.day}</span>
                  <span className="flex h-1.5 items-center justify-center gap-0.5 lg:hidden">
                    {events.slice(0, 4).map((event) => (
                      <i key={event.id} className="size-1.5 rounded-full" style={{ background: event.color }} />
                    ))}
                  </span>
                  <span className="hidden gap-0.5 lg:grid">
                    {events.slice(0, 3).map((event) => (
                      <span key={event.id} className="truncate rounded px-1 text-[11px] font-medium" style={{ background: `color-mix(in srgb, ${event.color} 14%, white)`, color: event.color }}>
                        {event.time} {event.client}
                      </span>
                    ))}
                    {events.length > 3 ? <span className="text-muted-foreground text-[11px]">ещё {events.length - 3}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>

          <section className={cn(mode === "week" && "lg:hidden")}>
            <h2 className="mb-2 text-sm font-bold first-letter:uppercase">{dayParts(selectedDay).long}</h2>
            <DayList events={byDay.get(selectedDay) ?? []} empty="На этот день ничего не назначено." />
          </section>

          {mode === "week" ? (
            <div className="hidden grid-cols-7 gap-2 lg:grid">
              {days.map((day) => {
                const parts = dayParts(day);
                return (
                  <section key={day} className={cn("bg-muted/60 min-w-0 rounded-xl p-2", day === today && "ring-primary ring-2")}>
                    <h2 className="mb-2 flex items-baseline gap-1.5 px-1">
                      <span className="text-lg font-bold tabular-nums">{parts.day}</span>
                      <span className="text-muted-foreground text-xs uppercase">{parts.weekday}</span>
                    </h2>
                    <DayList events={byDay.get(day) ?? []} empty="—" />
                  </section>
                );
              })}
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
