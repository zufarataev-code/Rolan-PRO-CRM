"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, TriangleAlertIcon, UserIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { dateTime, money } from "@/features/crm-shell/format";
import type { CrmFilmStock, CrmInventory, CrmPurchaseRow } from "@/features/crm-shell/types";
import { LoadError, LoadingBlock, PageHeader, Pill } from "@/features/crm-shell/ui";
import { useCrmData } from "@/features/crm-shell/use-crm-data";
import { cn } from "@/lib/utils";

/** The working «Склад» section: receipts, issues, purchase requests, QR labels and edits still live there. */
const LEGACY_INVENTORY = "/crm/section/inventory";

type Tab = "overview" | "film" | "supplies" | "tools" | "movements";

const qty = (value: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);

const PURCHASE_TONE: Record<CrmPurchaseRow["status"], "muted" | "warn" | "info" | "ok"> = {
  draft: "muted",
  requested: "warn",
  approved: "info",
  ordered: "info",
  received: "ok",
  cancelled: "muted",
};

function Kpi({ title, value, tone }: { title: string; value: string; tone?: "ok" | "warn" | "danger" | "info" }) {
  const color = { ok: "text-success", warn: "text-warning", danger: "text-destructive", info: "text-info" };
  return (
    <div className="bg-card min-w-0 rounded-lg border p-3 shadow-xs">
      <div className="text-muted-foreground truncate text-xs">{title}</div>
      <div className={cn("mt-1 truncate text-lg font-bold tabular-nums", tone && color[tone])}>{value}</div>
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">{children}</p>;
}

function PurchaseCard({ row }: { row: CrmPurchaseRow }) {
  return (
    <article className="bg-card min-w-0 rounded-lg border p-3 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <b className="min-w-0 text-sm break-words">{row.item}</b>
        <Pill tone={PURCHASE_TONE[row.status]}>{row.statusLabel}</Pill>
      </div>
      <div className="text-muted-foreground mt-1 text-xs tabular-nums">
        {row.number} · {qty(row.qty)} {row.unit}
        {row.neededBy ? ` · к ${row.neededBy}` : ""}
      </div>
      <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="flex items-center gap-1">
          <UserIcon className="size-3.5" />
          {row.responsible || "не назначен"}
        </span>
        {row.vendor ? <span className="truncate">{row.vendor}</span> : null}
      </div>
      <div className="mt-2">
        {row.project?.open ? (
          <Link href={`/crm/projects/${encodeURIComponent(row.project.id)}`} className="hover:text-primary text-xs font-medium">
            {row.project.label}
          </Link>
        ) : row.project ? (
          <span className="text-xs font-medium">{row.project.label}</span>
        ) : (
          <span className="text-muted-foreground text-xs">Общий запас склада</span>
        )}
      </div>
    </article>
  );
}

function FilmCard({ film }: { film: CrmFilmStock }) {
  return (
    <article className={cn("bg-card min-w-0 rounded-lg border p-3 shadow-xs", film.status === "critical" && "border-destructive/40")}>
      <div className="flex items-start justify-between gap-2">
        <b className="min-w-0 text-sm break-words">{film.name}</b>
        {film.status === "critical" ? <Pill tone="danger">Срочно</Pill> : film.status === "reorder" ? <Pill tone="warn">Мало</Pill> : null}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-muted-foreground">Рулонов</div>
          <b className="tabular-nums">{film.rolls}</b>
        </div>
        <div>
          <div className="text-muted-foreground">Остаток</div>
          <b className="tabular-nums">{qty(film.lengthM)} м</b>
        </div>
        <div>
          <div className="text-muted-foreground">Площадь</div>
          <b className="tabular-nums">{qty(film.sqft)} sq ft</b>
        </div>
      </div>
      {film.vendor ? <div className="text-muted-foreground mt-2 truncate text-xs">{film.vendor}</div> : null}
    </article>
  );
}

export default function CrmInventoryPage() {
  const { data, error, loading, reload } = useCrmData<CrmInventory>("/api/v1/crm-ui/inventory");
  const [tab, setTab] = useState<Tab>("overview");

  const tabs: Array<[Tab, string, number | null]> = data
    ? [
        ["overview", "Обзор", data.needs.length || null],
        ["film", "Плёнка", data.film.length],
        ["supplies", "Расходники", data.supplies.length],
        ["tools", "Инструмент", data.tools.length],
        ["movements", "Движения", null],
      ]
    : [];

  // Film stays grouped by direction, as on the working screen.
  const filmGroups = data
    ? data.film.reduce<Array<{ label: string; items: CrmFilmStock[] }>>((groups, film) => {
        const last = groups[groups.length - 1];
        if (last && last.label === film.categoryLabel) last.items.push(film);
        else groups.push({ label: film.categoryLabel, items: [film] });
        return groups;
      }, [])
    : [];

  return (
    <>
      <PageHeader title="Склад" sub="Остатки, закупки под проекты и движения" loading={loading} onReload={() => void reload()}>
        <Button asChild>
          <Link href={LEGACY_INVENTORY}>Приход, списание, заявка</Link>
        </Button>
      </PageHeader>
      <LoadError message={error} />
      {!data && loading ? <LoadingBlock /> : null}
      {data ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Kpi title="Стоимость остатков" value={money(data.kpi.stockValue)} tone="ok" />
            <Kpi title="Заканчивается" value={String(data.kpi.needs)} tone={data.kpi.needs ? "warn" : undefined} />
            <Kpi title="Нет в наличии" value={String(data.kpi.out)} tone={data.kpi.out ? "danger" : undefined} />
            <Kpi title="Закупок в работе" value={String(data.kpi.active)} tone="info" />
          </div>

          <div className="no-scrollbar -mx-3 mb-3 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:px-0" role="tablist" aria-label="Раздел склада">
            {tabs.map(([id, title, count]) => {
              const active = id === tab;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(id)}
                  className={cn(
                    "flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-semibold",
                    active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground",
                  )}
                >
                  {title}
                  {count !== null ? <span className={cn("tabular-nums", active ? "opacity-90" : "text-muted-foreground")}>{count}</span> : null}
                </button>
              );
            })}
          </div>

          {tab === "overview" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="min-w-0">
                <h2 className="mb-2 px-1 text-sm font-bold">Что нужно закупить</h2>
                {data.needs.length ? (
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
                    {data.needs.map((need) => (
                      <article key={need.id} className={cn("bg-card min-w-0 rounded-lg border p-3 shadow-xs", need.critical && "border-destructive/40")}>
                        <div className="flex items-start justify-between gap-2">
                          <b className="min-w-0 text-sm break-words">{need.name}</b>
                          {need.critical ? (
                            <Pill tone="danger">
                              <TriangleAlertIcon className="mr-1 size-3" />
                              Срочно
                            </Pill>
                          ) : (
                            <Pill tone="warn">Мало</Pill>
                          )}
                        </div>
                        <div className="text-muted-foreground mt-1 text-xs tabular-nums">
                          Есть {qty(need.qty)} {need.unit} · нужно иметь {qty(need.target)} {need.unit}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Pill tone={need.kind === "film" ? "info" : "muted"}>{need.kind === "film" ? "Плёнка" : "Расходник"}</Pill>
                          {need.vendor ? <Pill>{need.vendor}</Pill> : <Pill tone="warn">поставщик не выбран</Pill>}
                          {need.draft ? <Pill tone="ok">заявка {need.draft}</Pill> : null}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <Empty>Всего хватает</Empty>
                )}
              </section>
              <section className="min-w-0">
                <h2 className="mb-2 px-1 text-sm font-bold">Закупки в работе</h2>
                {data.active.length ? (
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
                    {data.active.map((row) => (
                      <PurchaseCard key={row.id} row={row} />
                    ))}
                  </div>
                ) : (
                  <Empty>Активных заявок нет</Empty>
                )}
              </section>
            </div>
          ) : null}

          {tab === "film" ? (
            filmGroups.length ? (
              <div className="grid gap-4">
                {filmGroups.map((group) => (
                  <section key={group.label} className="min-w-0">
                    <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-bold">
                      {group.label}
                      <span className="bg-muted text-muted-foreground rounded-full px-1.5 text-xs tabular-nums">{group.items.length}</span>
                    </h2>
                    <div className="grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {group.items.map((film) => (
                        <FilmCard key={film.id} film={film} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <Empty>Рулонов на складе пока нет</Empty>
            )
          ) : null}

          {tab === "supplies" ? (
            data.supplies.length ? (
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-2 xl:grid-cols-3">
                {data.supplies.map((supply) => (
                  <article key={supply.id} className={cn("bg-card min-w-0 rounded-lg border p-3 shadow-xs", supply.status === "critical" && "border-destructive/40")}>
                    <div className="flex items-start justify-between gap-2">
                      <b className="min-w-0 text-sm break-words">{supply.name}</b>
                      <span className={cn("shrink-0 text-sm font-bold tabular-nums", supply.status === "critical" ? "text-destructive" : supply.status === "low" ? "text-warning" : "")}>
                        {qty(supply.qty)} {supply.unit}
                      </span>
                    </div>
                    <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 text-xs">
                      {supply.min !== null ? (
                        <span>
                          минимум {qty(supply.min)} {supply.unit}
                        </span>
                      ) : null}
                      {supply.location ? <span>{supply.location}</span> : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty>Расходников пока нет</Empty>
            )
          ) : null}

          {tab === "tools" ? (
            data.tools.length ? (
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-2 xl:grid-cols-3">
                {data.tools.map((tool) => (
                  <article key={tool.id} className={cn("bg-card min-w-0 rounded-lg border p-3 shadow-xs", tool.tone === "danger" ? "border-destructive/50" : tool.tone === "warn" && "border-warning/50")}>
                    <div className="flex items-start justify-between gap-2">
                      <b className="min-w-0 text-sm break-words">{tool.name}</b>
                      <Pill tone={tool.tone}>{tool.condition}</Pill>
                    </div>
                    <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      {tool.number ? <span className="tabular-nums">№ {tool.number}</span> : null}
                      <span className="flex items-center gap-1">
                        <UserIcon className="size-3.5" />
                        {tool.holder || "на складе"}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty>Инструмента пока нет</Empty>
            )
          ) : null}

          {tab === "movements" ? (
            data.movements.length ? (
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2 lg:grid-cols-2">
                {data.movements.map((move) => (
                  <article key={move.id} className="bg-card flex min-w-0 items-start gap-3 rounded-lg border p-3 shadow-xs">
                    <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", move.receipt ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
                      {move.receipt ? <ArrowDownIcon className="size-4" /> : <ArrowUpIcon className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <b className="min-w-0 text-sm break-words">{move.item}</b>
                        <span className="shrink-0 text-sm font-bold tabular-nums">
                          {move.receipt ? "+" : "−"}
                          {qty(move.qty)} {move.unit}
                        </span>
                      </div>
                      <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 text-xs">
                        <span>{move.receipt ? "Приход" : "Списание"}</span>
                        <span>{dateTime(move.at)}</span>
                        {move.who ? <span>{move.who}</span> : null}
                      </div>
                      {move.project?.open ? (
                        <Link href={`/crm/projects/${encodeURIComponent(move.project.id)}`} className="hover:text-primary mt-1 block truncate text-xs font-medium">
                          {move.project.label}
                        </Link>
                      ) : move.project ? (
                        <span className="mt-1 block truncate text-xs font-medium">{move.project.label}</span>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty>Движений пока нет</Empty>
            )
          ) : null}

          <div className="mt-4 flex justify-center">
            <Button asChild variant="ghost" size="sm">
              <Link href={LEGACY_INVENTORY}>Прежний экран: приход, списание, QR, поставщики</Link>
            </Button>
          </div>
        </>
      ) : null}
    </>
  );
}
