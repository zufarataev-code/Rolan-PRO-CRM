"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGridIcon, ListIcon, SearchIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { moneyShort } from "@/features/crm-shell/format";
import { ProjectCard } from "@/features/crm-shell/project-card";
import type { CrmProjectCard, CrmProjectsBoard } from "@/features/crm-shell/types";
import { LoadError, LoadingBlock, PageHeader, Pill } from "@/features/crm-shell/ui";
import { useCrmData } from "@/features/crm-shell/use-crm-data";
import { saveWorkingFrame, WorkingFrame } from "@/features/crm-shell/working-frame";
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

type ArchiveWindow = Window & { openArchiveProjectModal?: (id: string) => void; getOrder?: (id: string) => unknown };

/** Every project in one table: number, client, stage, money, next step — and «В архив» for the owner. */
function ProjectList({ columns, canArchive, onArchive }: { columns: Column[]; canArchive: boolean; onArchive: (card: CrmProjectCard) => void }) {
  const rows = columns.flatMap((column) => column.cards.map((card) => ({ card, column })));
  if (!rows.length) return <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">Проектов нет.</p>;
  return (
    <>
    {/* Phone (Owner, 2026-11-28: «на телефоне заезжает за экран»): one card per project instead of a wide table. */}
    <ul className="flex flex-col gap-2 md:hidden">
      {rows.map(({ card, column }) => (
        <li key={card.id} className="bg-card flex items-start gap-2 rounded-xl border p-3">
          <Link href={`/crm/projects/${encodeURIComponent(card.id)}`} className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <b>{card.number}</b>
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs"><i className="size-2 rounded-full" style={{ background: column.color }} />{column.title}</span>
              {card.accent ? <Pill tone="muted">{card.accent.label}</Pill> : null}
            </div>
            <div className="mt-1 font-medium break-words">{card.client}</div>
            {card.address ? <div className="text-muted-foreground text-xs break-words">{card.address}</div> : null}
            {card.sum > 0 || card.debt > 0 ? (
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums">
                {card.sum > 0 ? <span>{moneyShort(card.sum)}</span> : null}
                {card.debt > 0 ? <span className="text-destructive">Долг {moneyShort(card.debt)}</span> : null}
              </div>
            ) : null}
            {card.next ? <div className="text-muted-foreground mt-1 text-xs break-words">{card.next}</div> : null}
          </Link>
          {canArchive ? (
            <Button variant="ghost" size="sm" className="shrink-0" aria-label={`Удалить проект ${card.number} в архив`} onClick={() => onArchive(card)}>
              <Trash2Icon className="size-4" />
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
    <div className="bg-card overflow-x-auto rounded-xl border max-md:hidden">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="text-muted-foreground text-xs">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium">Проект</th>
            <th className="px-3 py-2 font-medium">Клиент · адрес</th>
            <th className="px-3 py-2 font-medium">Стадия</th>
            <th className="px-3 py-2 text-right font-medium">Сумма</th>
            <th className="px-3 py-2 text-right font-medium">Долг</th>
            <th className="px-3 py-2 font-medium">Следующий шаг</th>
            {canArchive ? <th className="px-3 py-2" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ card, column }) => (
            <tr key={card.id} className="border-t">
              <td className="px-3 py-2 whitespace-nowrap">
                <Link href={`/crm/projects/${encodeURIComponent(card.id)}`} className="font-semibold">{card.number}</Link>
              </td>
              <td className="px-3 py-2">
                <div className="font-medium">{card.client}</div>
                {card.address ? <div className="text-muted-foreground truncate text-xs" style={{ maxWidth: 320 }}>{card.address}</div> : null}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: column.color }} />{column.title}</span>
                {card.accent ? <div className="mt-0.5"><Pill tone="muted">{card.accent.label}</Pill></div> : null}
              </td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{card.sum > 0 ? moneyShort(card.sum) : ""}</td>
              <td className={cn("px-3 py-2 text-right tabular-nums whitespace-nowrap", card.debt > 0 && "text-destructive")}>{card.debt > 0 ? moneyShort(card.debt) : ""}</td>
              <td className="text-muted-foreground px-3 py-2 text-xs">{card.next}</td>
              {canArchive ? (
                <td className="px-2 py-2 text-right">
                  <Button variant="ghost" size="sm" aria-label={`Удалить проект ${card.number} в архив`} onClick={() => onArchive(card)}>
                    <Trash2Icon className="size-4" />
                  </Button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

export default function CrmProjectsPage() {
  const { data, error, loading, reload } = useCrmData<CrmProjectsBoard>("/api/v1/crm-ui/projects");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("");
  // Owner, 2026-11-27: a list beside the board, with «удалить проект» on each row.
  const [view, setView] = useState<"board" | "list">("board");
  const [archiving, setArchiving] = useState<CrmProjectCard | null>(null);
  const [closing, setClosing] = useState(false);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("crm.projects.view");
      if (saved === "list" || saved === "board") setView(saved);
    } catch {
      /* private mode */
    }
  }, []);
  const chooseView = (next: "board" | "list") => {
    setView(next);
    try {
      window.localStorage.setItem("crm.projects.view", next);
    } catch {
      /* private mode */
    }
  };

  // Deleting is the working CRM's own «Удалить проект в архив» (owner only, with a
  // reason, restorable): it runs in the working CRM, shown in a panel.
  const startArchive = () => {
    const card = archiving;
    if (!card) return;
    let tries = 0;
    const attempt = () => {
      let win: ArchiveWindow | null = null;
      try {
        win = frame.current?.contentWindow as ArchiveWindow | null;
      } catch {
        win = null;
      }
      try {
        if (win?.openArchiveProjectModal && win.getOrder?.(card.id)) return void win.openArchiveProjectModal(card.id);
      } catch {
        /* the working CRM is still starting */
      }
      if ((tries += 1) < 40) window.setTimeout(attempt, 500);
    };
    attempt();
  };
  const closeArchive = (open: boolean) => {
    if (open || closing) return;
    setClosing(true);
    void saveWorkingFrame(frame.current).finally(() => {
      setClosing(false);
      setArchiving(null);
      void reload();
    });
  };

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

  const canArchive = data?.user.role === "owner";

  return (
    <div ref={(node) => setRoot(node?.closest<HTMLElement>(".rp-crm") ?? null)}>
      <PageHeader title="Проекты" sub={data ? `В работе: ${activeCount}` : "Воронка проектов"} loading={loading} onReload={() => void reload()}>
        <div className="bg-muted inline-flex rounded-lg p-0.5" role="tablist" aria-label="Вид">
          <button type="button" role="tab" aria-selected={view === "board"} onClick={() => chooseView("board")} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium", view === "board" ? "bg-card shadow-sm" : "text-muted-foreground")}>
            <LayoutGridIcon className="size-4" /> Доска
          </button>
          <button type="button" role="tab" aria-selected={view === "list"} onClick={() => chooseView("list")} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium", view === "list" ? "bg-card shadow-sm" : "text-muted-foreground")}>
            <ListIcon className="size-4" /> Список
          </button>
        </div>
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

          {view === "list" ? <ProjectList columns={columns} canArchive={canArchive} onArchive={setArchiving} /> : null}

          {/* Phone: stages as a row of chips, one stage on the screen at a time. */}
          <div className={cn("lg:hidden", view === "list" && "hidden")}>
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
              With the sidebar a 1440–1920px screen leaves ~1265–1600px for the board: seven columns fit from 164px,
              so that is the minimum; narrower than that the row scrolls with a visible scrollbar. */}
          <div className={cn("flex gap-2 overflow-x-auto pb-3 [scrollbar-width:thin] max-lg:hidden", view === "list" && "lg:hidden")}>
            {columns.map((column) => (
              <section key={column.id} id={column.id} className="bg-muted/60 min-w-[164px] flex-1 basis-0 rounded-xl p-1.5" style={{ borderTop: `3px solid ${column.color}` }}>
                <ColumnHead column={column} />
                <ColumnCards column={column} />
              </section>
            ))}
          </div>
        </>
      ) : null}

      <Sheet open={Boolean(archiving)} onOpenChange={closeArchive}>
        <SheetContent side="right" container={root} className="w-full gap-0 p-0 sm:max-w-none lg:w-[min(1200px,calc(100vw-16rem))]">
          <SheetHeader className="border-b py-3 pr-12">
            <SheetTitle className="truncate">Удалить проект в архив: {archiving?.number}</SheetTitle>
            <SheetDescription>{closing ? "Сохраняю изменения…" : "Проект не стирается — уходит в архив и восстанавливается одной кнопкой"}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">{archiving ? <WorkingFrame ref={frame} src="/legacy-crm#/section/orders" title="Удаление проекта в архив" onLoad={startArchive} /> : null}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
