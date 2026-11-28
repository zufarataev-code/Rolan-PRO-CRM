"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SparklesIcon, UserIcon, UsersIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CrmTaskRow, CrmTasks } from "@/features/crm-shell/types";
import { LoadError, LoadingBlock, PageHeader, Pill } from "@/features/crm-shell/ui";
import { useCrmData } from "@/features/crm-shell/use-crm-data";
import { useViewerToday } from "@/features/crm-shell/use-viewer-today";
import { cn } from "@/lib/utils";

/** The working «Задачи» section: adding, ticking off, assigning and reminders still live there. */
const LEGACY_TASKS = "/crm/section/tasks";

type Bucket = "overdue" | "today" | "later" | "nodate";
const BUCKETS: Array<{ id: Bucket; title: string }> = [
  { id: "overdue", title: "Просрочено" },
  { id: "today", title: "Сегодня" },
  { id: "later", title: "Позже" },
  { id: "nodate", title: "Без даты" },
];

function bucketOf(task: CrmTaskRow, today: string): Bucket {
  if (!task.dueKey) return "nodate";
  if (task.dueKey < today) return "overdue";
  if (task.dueKey === today) return "today";
  return "later";
}

function dueLabel(task: CrmTaskRow) {
  if (!task.dueKey) return "";
  const day = new Date(`${task.dueKey}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${day}${task.time ? `, ${task.time}` : ""}`;
}

function TaskRow({ task, overdue }: { task: CrmTaskRow; overdue?: boolean }) {
  return (
    <article className={cn("bg-card min-w-0 rounded-lg border p-3 shadow-xs", overdue && "border-destructive/40")}>
      <div className="flex items-start justify-between gap-2">
        <b className={cn("min-w-0 text-sm break-words", task.done && "text-muted-foreground line-through")}>{task.title}</b>
        {task.dueKey ? <span className={cn("shrink-0 text-xs font-semibold tabular-nums", overdue ? "text-destructive" : "text-muted-foreground")}>{dueLabel(task)}</span> : null}
      </div>
      <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="flex items-center gap-1">
          <UserIcon className="size-3.5" />
          {task.responsible || "не назначен"}
        </span>
        {task.team.length ? (
          <span className="flex min-w-0 items-center gap-1">
            <UsersIcon className="size-3.5 shrink-0" />
            <span className="truncate">{task.team.join(", ")}</span>
          </span>
        ) : null}
      </div>
      {task.client || task.agent || task.mine ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {task.mine ? <Pill tone="ok">Моя</Pill> : null}
          {task.client ? <Pill tone="warn">{task.client}</Pill> : null}
          {task.agent ? (
            <Pill tone="info">
              <SparklesIcon className="mr-1 size-3" />
              Агент Rolan PRO
            </Pill>
          ) : null}
        </div>
      ) : null}
      {task.notes ? <p className="text-muted-foreground mt-2 text-xs break-words">{task.notes}</p> : null}
    </article>
  );
}

export default function CrmTasksPage() {
  const { data, error, loading, reload } = useCrmData<CrmTasks>("/api/v1/crm-ui/tasks");
  // «Сегодня» is the viewer's own day, known only in the browser.
  const today = useViewerToday();
  const [mineOnly, setMineOnly] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const groups = useMemo(() => {
    const result: Record<Bucket, CrmTaskRow[]> = { overdue: [], today: [], later: [], nodate: [] };
    if (!data || !today) return result;
    for (const task of data.open) {
      if (mineOnly && !task.mine) continue;
      result[bucketOf(task, today)].push(task);
    }
    return result;
  }, [data, today, mineOnly]);

  const mineCount = data?.open.filter((task) => task.mine).length ?? 0;
  const openCount = mineOnly ? mineCount : (data?.open.length ?? 0);

  return (
    <>
      <PageHeader title="Задачи" sub={data ? `Открыто: ${data.open.length}` : "Звонки, закупки, напоминания"} loading={loading || !today} onReload={() => void reload()}>
        <Button asChild>
          <Link href={LEGACY_TASKS}>Новая задача</Link>
        </Button>
      </PageHeader>
      <LoadError message={error} />
      {(!data && loading) || !today ? <LoadingBlock /> : null}
      {data && today ? (
        <>
          <div className="no-scrollbar -mx-3 mb-3 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:px-0" role="tablist" aria-label="Чьи задачи">
            {[
              { id: false, title: "Все", count: data.open.length },
              { id: true, title: "Мои", count: mineCount },
            ].map((chip) => {
              const active = chip.id === mineOnly;
              return (
                <button
                  key={chip.title}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMineOnly(chip.id)}
                  className={cn(
                    "flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-semibold",
                    active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground",
                  )}
                >
                  {chip.title}
                  <span className={cn("tabular-nums", active ? "opacity-90" : "text-muted-foreground")}>{chip.count}</span>
                </button>
              );
            })}
          </div>

          {openCount ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {BUCKETS.filter((bucket) => groups[bucket.id].length).map((bucket) => (
                <section key={bucket.id} className="min-w-0">
                  <h2 className={cn("mb-2 flex items-center gap-2 px-1 text-sm font-bold", bucket.id === "overdue" && "text-destructive")}>
                    {bucket.title}
                    <span className="bg-muted text-muted-foreground rounded-full px-1.5 text-xs tabular-nums">{groups[bucket.id].length}</span>
                  </h2>
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
                    {groups[bucket.id].map((task) => (
                      <TaskRow key={task.id} task={task} overdue={bucket.id === "overdue"} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">{mineOnly ? "У вас открытых задач нет" : "Открытых задач нет"}</p>
          )}

          {data.doneTotal ? (
            <section className="mt-5">
              <Button variant="ghost" size="sm" onClick={() => setShowDone((value) => !value)} aria-expanded={showDone}>
                {showDone ? "Скрыть выполненные" : `Выполненные: ${data.doneTotal}`}
              </Button>
              {showDone ? (
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2 lg:grid-cols-2">
                  {data.done.map((task) => (
                    <TaskRow key={task.id} task={task} />
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="mt-4 flex justify-center">
            <Button asChild variant="ghost" size="sm" className="h-auto min-h-8 max-w-full py-1.5 text-center whitespace-normal">
              <Link href={LEGACY_TASKS}>Прежний экран: отметить, назначить, удалить</Link>
            </Button>
          </div>
        </>
      ) : null}
    </>
  );
}
