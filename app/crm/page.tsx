"use client";

import Link from "next/link";
import { ArrowRightIcon, CalendarClockIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { dateTime, money, moneyShort, plural } from "@/features/crm-shell/format";
import type { CrmOverview } from "@/features/crm-shell/types";
import { LoadError, LoadingBlock, PageHeader, Pill, RingCard, SectionTitle, UrgencyPill } from "@/features/crm-shell/ui";
import { useCrmData } from "@/features/crm-shell/use-crm-data";

function MonthBars({ bars }: { bars: CrmOverview["month"]["bars"] }) {
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  return (
    <div className="flex h-36 items-end gap-2" role="img" aria-label={`Оплаченные проекты по неделям: ${bars.map((bar) => `${bar.label} — ${money(bar.value)}`).join("; ")}`}>
      {bars.map((bar) => (
        <div key={bar.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span className="text-muted-foreground text-[11px] font-semibold tabular-nums">{bar.value > 0 ? moneyShort(bar.value) : ""}</span>
          <div className="bg-muted flex h-24 w-full items-end overflow-hidden rounded-md">
            <div className="bg-primary w-full rounded-md" style={{ height: `${Math.max(bar.value > 0 ? 6 : 0, (100 * bar.value) / max)}%` }} />
          </div>
          <span className="text-muted-foreground truncate text-[11px]">{bar.label}</span>
        </div>
      ))}
    </div>
  );
}

function Directions({ rows }: { rows: CrmOverview["directions"] }) {
  const total = rows.reduce((sum, row) => sum + row.sum, 0);
  if (!(total > 0)) return <p className="text-muted-foreground text-sm">В активных проектах пока нет услуг с ценой.</p>;
  const length = 2 * Math.PI * 42;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Доли направлений в сумме активных проектов" className="shrink-0">
        {rows.map((row) => {
          const part = (length * row.sum) / total;
          const arc = <circle key={row.title} cx="60" cy="60" r="42" fill="none" stroke={row.color} strokeWidth="16" strokeDasharray={`${part} ${length - part}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />;
          offset += part;
          return arc;
        })}
      </svg>
      <ul className="grid min-w-40 flex-1 gap-2">
        {rows.map((row) => (
          <li key={row.title} className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2 text-sm">
            <i className="size-2.5 rounded-sm" style={{ background: row.color }} />
            <span className="truncate">{row.title}</span>
            <b className="tabular-nums">{money(row.sum)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CrmOverviewPage() {
  const { data, error, loading, reload } = useCrmData<CrmOverview>("/api/v1/crm-ui/overview");
  const hello = data?.user.name ? `${data.user.name}, вот что происходит сейчас` : "Что происходит сейчас";

  return (
    <>
      <PageHeader title="Главная" sub={hello} loading={loading} onReload={() => void reload()}>
        <Button asChild>
          <Link href="/crm/projects">
            Проекты <ArrowRightIcon />
          </Link>
        </Button>
      </PageHeader>
      <LoadError message={error} />
      {!data && loading ? <LoadingBlock /> : null}
      {data ? (
        <div className="grid gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <RingCard pct={data.paidPct} title={money(data.activePaid)} sub={`оплачено из ${money(data.activeRevenue)} в работе`} />
            <RingCard pct={data.reachedPct} title={`${data.reachedCount} из ${data.activeCount}`} sub="проектов дошли до монтажа" color="var(--info)" />
            <RingCard pct={data.linePct} title={`${data.lineDone} из ${data.lineTotal}`} sub="услуг выполнено в активных проектах" color="var(--warning)" />
            <RingCard pct={data.awaitingPct} title={money(data.awaiting)} sub="ждём оплату после монтажа" color="#7d4fc4" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Card className="gap-4 py-5">
              <CardHeader className="px-5">
                <SectionTitle>Оплаченные проекты за месяц</SectionTitle>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-3xl font-bold tabular-nums">{money(data.month.revenue)}</span>
                  <span className="text-muted-foreground text-sm">
                    {data.month.paid} {plural(data.month.paid, "проект оплачен", "проекта оплачено", "проектов оплачено")} · {data.month.created} {plural(data.month.created, "новый", "новых", "новых")}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="px-5">
                <MonthBars bars={data.month.bars} />
              </CardContent>
            </Card>
            <Card className="gap-4 py-5">
              <CardHeader className="px-5">
                <SectionTitle>Направления в работе</SectionTitle>
              </CardHeader>
              <CardContent className="px-5">
                <Directions rows={data.directions} />
              </CardContent>
            </Card>
          </div>

          <Card className="gap-4 py-5">
            <CardHeader className="flex flex-row items-center justify-between px-5">
              <SectionTitle>Воронка проектов</SectionTitle>
              <Link href="/crm/projects" className="text-primary text-sm font-semibold hover:underline">
                Открыть воронку
              </Link>
            </CardHeader>
            <CardContent className="px-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                {data.funnel.map((stage) => (
                  <Link key={stage.id} href={`/crm/projects#${stage.id}`} className="hover:bg-accent rounded-lg border p-3 transition-colors" style={{ borderTopColor: stage.color, borderTopWidth: 3 }}>
                    <div className="text-muted-foreground truncate text-xs font-medium">{stage.title}</div>
                    <div className="mt-1 text-2xl leading-none font-bold tabular-nums">{stage.count}</div>
                    <div className="text-muted-foreground mt-1 text-xs tabular-nums">{stage.sum > 0 ? money(stage.sum) : "—"}</div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Card className="gap-3 py-5">
              <CardHeader className="px-5">
                <SectionTitle>Что сделать в первую очередь</SectionTitle>
              </CardHeader>
              <CardContent className="grid gap-2 px-5">
                {data.attention.length ? (
                  data.attention.map((card) => (
                    <Link key={card.id} href={`/crm/projects/${encodeURIComponent(card.id)}`} className="hover:bg-accent grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border p-3 transition-colors">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <b className="truncate">{card.client}</b>
                          <UrgencyPill label={card.urgency} />
                        </div>
                        <div className="text-muted-foreground mt-0.5 truncate text-xs">
                          {card.number} · {card.status}
                        </div>
                        {card.next ? <div className="text-primary mt-1 truncate text-sm font-semibold">→ {card.next}</div> : null}
                      </div>
                      <div className="text-right font-bold tabular-nums">{card.sum > 0 ? money(card.sum) : ""}</div>
                    </Link>
                  ))
                ) : (
                  <p className="text-muted-foreground text-sm">Активных проектов нет.</p>
                )}
              </CardContent>
            </Card>
            <Card className="gap-3 py-5">
              <CardHeader className="px-5">
                <SectionTitle>Монтажи на 7 дней</SectionTitle>
              </CardHeader>
              <CardContent className="grid gap-2 px-5">
                {data.installs.length ? (
                  data.installs.map((visit) => (
                    <Link key={visit.id} href={`/crm/projects/${encodeURIComponent(visit.id)}`} className="hover:bg-accent flex items-start gap-3 rounded-lg border p-3 transition-colors">
                      <CalendarClockIcon className="text-primary mt-0.5 size-4 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{dateTime(visit.at)}</div>
                        <div className="truncate text-sm">{visit.client}</div>
                        <div className="text-muted-foreground truncate text-xs">{visit.crew.length ? visit.crew.join(", ") : "бригада не назначена"}</div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-muted-foreground text-sm">На ближайшую неделю монтажей не назначено.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </>
  );
}
