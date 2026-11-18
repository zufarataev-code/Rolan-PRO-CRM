"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { MailIcon, PhoneIcon, PlusIcon, SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { dateTime } from "@/features/crm-shell/format";
import { filterLeads, leadFilters, leadRows, OPEN_LEAD_STATUSES, REASON_STAGES, stageChoices, type ApiLead, type LeadRow, type LeadStage } from "@/features/crm-shell/leads";
import type { CrmLeadLinks } from "@/features/crm-shell/types";
import { LoadError, LoadingBlock, PageHeader, Pill } from "@/features/crm-shell/ui";
import { useCrmData } from "@/features/crm-shell/use-crm-data";
import { saveWorkingFrame, WorkingFrame } from "@/features/crm-shell/working-frame";
import { cn } from "@/lib/utils";

type LeadsData = { items: ApiLead[]; stages: LeadStage[] };
type Link_ = CrmLeadLinks["links"][string] | undefined;

/** The stage of a lead: the same endpoint and the same rules as in the working CRM. */
function StageControl({ row, stages, onChanged }: { row: LeadRow; stages: LeadStage[]; onChanged: () => void }) {
  const [pending, setPending] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (code: string, why?: string) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/leads/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ pipeline_status_code: code, expected_status_codes: [row.statusCode], stage_reason: why }),
      });
      const body = (await response.json().catch(() => null)) as { errors?: { message?: string }[] } | null;
      if (!response.ok) setError(body?.errors?.[0]?.message || "Не удалось сменить этап. Обновите список и попробуйте ещё раз.");
      else {
        setPending("");
        setReason("");
      }
    } catch {
      setError("Сервер не ответил. Проверьте связь и попробуйте ещё раз.");
    }
    setBusy(false);
    onChanged();
  };

  const choose = (code: string) => {
    if (code === row.stageCode) return setPending("");
    if (REASON_STAGES.includes(code)) return setPending(code);
    void save(code);
  };

  return (
    <div className="grid gap-1.5">
      <label className="text-muted-foreground grid gap-1 text-xs font-medium">
        Этап лида
        <select
          aria-label={`Этап лида ${row.name}`}
          value={pending || row.stageCode}
          disabled={row.stageLocked || busy}
          onChange={(event) => choose(event.target.value)}
          className="bg-card text-foreground focus-visible:ring-ring/40 h-10 w-full rounded-lg border px-2 text-sm font-medium outline-none focus-visible:ring-[3px] disabled:opacity-60"
        >
          {stageChoices(row, stages).map((stage) => (
            <option key={stage.code} value={stage.code}>
              {stage.name}
            </option>
          ))}
        </select>
      </label>
      {pending ? (
        <div className="grid gap-1.5">
          <input
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Причина (обязательно)"
            aria-label="Причина"
            className="bg-card focus-visible:ring-ring/40 h-10 rounded-lg border px-3 text-sm outline-none focus-visible:ring-[3px]"
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !reason.trim()} onClick={() => void save(pending, reason.trim())}>
              {busy ? <Spinner /> : null} Сохранить
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPending("")}>
              Отмена
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

function LeadCard({ row, stages, link, onChanged, onConvert }: { row: LeadRow; stages: LeadStage[]; link: Link_; onChanged: () => void; onConvert: (row: LeadRow) => void }) {
  const canConvert = !row.stageClosed && OPEN_LEAD_STATUSES.includes(row.statusCode);
  return (
    <Card className="py-4">
      <CardContent className="grid gap-4 px-4 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <b className="truncate text-base">{row.name}</b>
            {row.isNew && !row.stageClosed ? <Pill tone="ok">новый</Pill> : null}
            <Pill tone={row.stageClosed ? "muted" : "info"}>{row.stageName}</Pill>
          </div>
          <div className="text-muted-foreground mt-0.5 text-xs">
            {row.sourceLabel} · {dateTime(row.receivedAt)}
            {row.city ? ` · ${row.city}` : ""}
            {row.manager ? ` · ${row.manager}` : ""}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {row.phone ? (
              <a href={`tel:${row.phone}`} className="text-primary inline-flex min-h-8 items-center gap-1.5 font-semibold">
                <PhoneIcon className="size-4" /> {row.phone}
              </a>
            ) : null}
            {row.email ? (
              <a href={`mailto:${row.email}`} className="inline-flex min-h-8 min-w-0 items-center gap-1.5">
                <MailIcon className="text-muted-foreground size-4 shrink-0" /> <span className="truncate">{row.email}</span>
              </a>
            ) : null}
          </div>
          {row.company || row.person ? <div className="mt-1 text-sm">{[row.company, row.person].filter(Boolean).join(" · ")}</div> : null}
          {row.message ? <p className="bg-muted mt-2 rounded-lg p-2.5 text-sm whitespace-pre-wrap">{row.message}</p> : null}
          {row.beingConverted ? <p className="text-warning mt-2 text-xs font-medium">Проект по заявке уже оформляется</p> : null}
          {row.history.length ? (
            <details className="text-muted-foreground mt-2 text-xs">
              <summary className="cursor-pointer">История этапов · {row.history.length}</summary>
              {row.history.map((change, index) => (
                <div key={index} className="mt-1">
                  {dateTime(change.at)} · {change.stage}
                  {change.reason ? ` · ${change.reason}` : ""}
                </div>
              ))}
            </details>
          ) : null}
        </div>
        <div className="grid content-start gap-2">
          <StageControl row={row} stages={stages} onChanged={onChanged} />
          {link?.archived ? (
            <span className="text-muted-foreground text-sm">Проект в архиве{link.number ? ` · ${link.number}` : ""}</span>
          ) : link?.projectId ? (
            <Button asChild>
              <Link href={`/crm/projects/${encodeURIComponent(link.projectId)}`}>Открыть проект{link.number ? ` ${link.number}` : ""}</Link>
            </Button>
          ) : canConvert ? (
            <Button onClick={() => onConvert(row)}>
              <PlusIcon /> Создать проект
            </Button>
          ) : null}
          {row.phone ? (
            <Button asChild variant="outline">
              <a href={`tel:${row.phone}`}>
                <PhoneIcon /> Позвонить
              </a>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

type WorkingWindow = Window & { canonicalLeadRow?: (id: string) => unknown; convertLead?: (id: string) => Promise<void> };

export default function CrmLeadsPage() {
  const leads = useCrmData<LeadsData>("/api/v1/leads");
  const links = useCrmData<CrmLeadLinks>("/api/v1/crm-ui/lead-links");
  const [filter, setFilter] = useState("active");
  const [query, setQuery] = useState("");
  const [converting, setConverting] = useState<LeadRow | null>(null);
  const [closing, setClosing] = useState(false);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  const stages = leads.data?.stages ?? [];
  const rows = useMemo(() => leadRows(leads.data?.items ?? [], leads.data?.stages ?? []), [leads.data]);
  const chips = useMemo(() => leadFilters(rows, stages), [rows, stages]);
  const shown = useMemo(() => filterLeads(rows, filter, query), [rows, filter, query]);
  const reload = () => {
    void leads.reload();
    void links.reload();
  };

  // «Создать проект» is the working CRM's own conversion (client match, project
  // number, reservation of the lead): it runs in the working CRM, shown in a panel.
  const startConversion = () => {
    const lead = converting;
    if (!lead) return;
    let tries = 0;
    const attempt = () => {
      let win: WorkingWindow | null = null;
      try {
        win = frame.current?.contentWindow as WorkingWindow | null;
      } catch {
        win = null;
      }
      try {
        if (win?.convertLead && win.canonicalLeadRow?.(lead.id)) return void win.convertLead(lead.id);
      } catch {
        /* the working CRM is still starting */
      }
      if ((tries += 1) < 40) window.setTimeout(attempt, 500);
    };
    attempt();
  };

  const closePanel = (open: boolean) => {
    if (open || closing) return;
    setClosing(true);
    void saveWorkingFrame(frame.current).finally(() => {
      setClosing(false);
      setConverting(null);
      reload();
    });
  };

  return (
    <div ref={(node) => setRoot(node?.closest<HTMLElement>(".rp-crm") ?? null)}>
      <PageHeader title="Новые лиды" sub={leads.data ? `Активных: ${rows.filter((row) => !row.stageClosed).length} · всего ${rows.length}` : "Заявки с сайта, звонков и рекламы"} loading={leads.loading} onReload={reload}>
        <Button asChild variant="outline">
          <Link href="/crm/section/leads">Прежний экран</Link>
        </Button>
      </PageHeader>
      <LoadError message={leads.error} />
      {!leads.data && leads.loading ? <LoadingBlock /> : null}
      {leads.data ? (
        <>
          <label className="bg-card focus-within:ring-ring/40 mb-3 flex h-10 items-center gap-2 rounded-lg border px-3 focus-within:ring-[3px] lg:max-w-sm">
            <SearchIcon className="text-muted-foreground size-4 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Имя, телефон, почта или текст заявки"
              aria-label="Поиск лида"
              className="placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          <div className="no-scrollbar -mx-3 mb-4 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:flex-wrap lg:px-0" role="tablist" aria-label="Этап лида">
            {chips.map((chip) => {
              const active = chip.id === filter;
              return (
                <button
                  key={chip.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(chip.id)}
                  className={cn("flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-semibold", active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground")}
                >
                  {chip.title}
                  <span className={cn("tabular-nums", active ? "opacity-90" : "text-muted-foreground")}>{chip.count}</span>
                </button>
              );
            })}
          </div>
          {shown.length ? (
            <div className="grid gap-3">
              {shown.map((row) => (
                <LeadCard key={row.id} row={row} stages={stages} link={links.data?.links[row.id]} onChanged={reload} onConvert={setConverting} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">{rows.length ? "По этому фильтру лидов нет." : "Все заявки обработаны. Новые лиды появятся здесь сами."}</p>
          )}
        </>
      ) : null}

      <Sheet open={Boolean(converting)} onOpenChange={closePanel}>
        <SheetContent side="right" container={root} className="w-full gap-0 p-0 sm:max-w-none lg:w-[min(1200px,calc(100vw-16rem))]">
          <SheetHeader className="border-b py-3 pr-12">
            <SheetTitle className="truncate">Проект из лида: {converting?.name}</SheetTitle>
            <SheetDescription>{closing ? "Сохраняю изменения…" : "Рабочая CRM создаёт проект и открывает его карточку"}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">{converting ? <WorkingFrame ref={frame} src="/legacy-crm#/section/leads" title="Создание проекта из лида" onLoad={startConversion} /> : null}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
