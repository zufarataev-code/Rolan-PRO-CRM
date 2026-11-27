"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { moneyShort } from "@/features/crm-shell/format";
import { ProjectCard } from "@/features/crm-shell/project-card";
import type { CrmProjectsBoard } from "@/features/crm-shell/types";
import { LoadError, LoadingBlock, PageHeader } from "@/features/crm-shell/ui";
import { useCrmData } from "@/features/crm-shell/use-crm-data";
import { cn } from "@/lib/utils";

type Column = CrmProjectsBoard["columns"][number];

function ColumnHead({ column }: { column: Column }) {
  return (
    <div className="flex items-center gap-2 px-1 pb-2">
      <i className="size-2.5 shrink-0 rounded-full" style={{ background: column.color }} />
      <b className="truncate text-sm">{column.title}</b>
      <span className="bg-muted text-muted-foreground rounded-full px-1.5 text-xs font-semibold tabular-nums">{column.count}</span>
      <span className="text-muted-foreground ml-auto text-xs font-semibold tabular-nums">{column.sum > 0 ? moneyShort(column.sum) : ""}</span>
    </div>
  );
}

function ColumnCards({ column }: { column: Column }) {
  if (!column.cards.length) return <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-xs">Пусто</p>;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
      {column.cards.map((card) => (
        <ProjectCard key={card.id} card={card} />
      ))}
      {column.hidden > 0 ? (
        <Button asChild variant="ghost" size="sm">
          <Link href="/crm/section/orders">Ещё {column.hidden} — все проекты</Link>
        </Button>
      ) : null}
    </div>
  );
}

export default function CrmProjectsPage() {
  const { data, error, loading, reload } = useCrmData<CrmProjectsBoard>("/api/v1/crm-ui/projects");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("");

  // The main screen links to a stage of the funnel: /crm/projects#install.
  useEffect(() => {
    const fromHash = window.location.hash.replace("#", "");
    if (fromHash) setStage(fromHash);
  }, []);

  const columns = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!data) return [];
    if (!needle) return data.columns;
    return data.columns.map((column) => {
      const cards = column.cards.filter((card) => `${card.client} ${card.number} ${card.address}`.toLowerCase().includes(needle));
      return { ...column, cards, count: cards.length, sum: cards.reduce((sum, card) => sum + card.sum, 0), hidden: 0 };
    });
  }, [data, query]);

  const selected = columns.find((column) => column.id === stage) ?? columns.find((column) => column.count > 0) ?? columns[0];
  const activeCount = columns.filter((column) => column.id !== "done").reduce((sum, column) => sum + column.count, 0);

  return (
    <>
      <PageHeader title="Проекты" sub={data ? `В работе: ${activeCount}` : "Воронка проектов"} loading={loading} onReload={() => void reload()}>
        <Button asChild>
          <Link href="/crm/section/orders">Новый проект</Link>
        </Button>
      </PageHeader>
      <LoadError message={error} />
      {!data && loading ? <LoadingBlock /> : null}
      {data ? (
        <>
          <label className="bg-card focus-within:ring-ring/40 mb-3 flex h-10 items-center gap-2 rounded-lg border px-3 focus-within:ring-[3px] lg:max-w-sm">
            <SearchIcon className="text-muted-foreground size-4 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Клиент, номер или адрес"
              aria-label="Поиск проекта"
              className="placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>

          {/* Phone: stages as a row of chips, one stage on the screen at a time. */}
          <div className="lg:hidden">
            <div className="no-scrollbar -mx-3 mb-3 flex gap-2 overflow-x-auto px-3 pb-1" role="tablist" aria-label="Этапы воронки">
              {columns.map((column) => {
                const active = column.id === selected?.id;
                return (
                  <button
                    key={column.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setStage(column.id)}
                    className={cn(
                      "flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-semibold",
                      active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground",
                    )}
                  >
                    <i className="size-2 rounded-full" style={{ background: active ? "currentColor" : column.color }} />
                    {column.title}
                    <span className={cn("tabular-nums", active ? "opacity-90" : "text-muted-foreground")}>{column.count}</span>
                  </button>
                );
              })}
            </div>
            {selected ? (
              <section>
                <ColumnHead column={selected} />
                <ColumnCards column={selected} />
              </section>
            ) : null}
          </div>

          {/* Computer: the whole funnel side by side. Columns share the width so every stage stays on screen.
              With the sidebar a 1440–1600px laptop leaves ~1265px for the board: seven columns fit from 164px,
              so the minimum is 164px; narrower than that the row scrolls with a visible scrollbar. */}
          <div className="flex gap-2 overflow-x-auto pb-3 [scrollbar-width:thin] max-lg:hidden">
            {columns.map((column) => (
              <section key={column.id} id={column.id} className="bg-muted/60 min-w-[164px] flex-1 basis-0 rounded-xl p-1.5" style={{ borderTop: `3px solid ${column.color}` }}>
                <ColumnHead column={column} />
                <ColumnCards column={column} />
              </section>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
