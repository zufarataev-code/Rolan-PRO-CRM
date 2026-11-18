"use client";

import Link from "next/link";
import { use, useState } from "react";
import { ArrowLeftIcon, CheckIcon, MapPinIcon, PanelRightOpenIcon, PhoneIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { dateTime, legacyProjectHref, money } from "@/features/crm-shell/format";
import type { CrmProjectDetails, CrmProjectPage, CrmStage } from "@/features/crm-shell/types";
import { LoadError, LoadingBlock, PageHeader, Pill, RingCard, SectionTitle, UrgencyPill } from "@/features/crm-shell/ui";
import { useCrmData } from "@/features/crm-shell/use-crm-data";
import { WorkingFrame } from "@/features/crm-shell/working-frame";
import { cn } from "@/lib/utils";

/** The working card's own stage line: same stages, same order, same hints. */
function StageLine({ stages }: { stages: CrmStage[] }) {
  return (
    <ol className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 xl:grid xl:grid-cols-9 xl:overflow-visible">
      {stages.map((stage, index) => {
        const reached = stage.state === "done" || stage.state === "current";
        return (
          <li
            key={`${stage.label}-${index}`}
            aria-current={stage.state === "current" ? "step" : undefined}
            className={cn("min-w-28 flex-1 rounded-lg border p-2 xl:min-w-0", stage.state === "current" && "shadow-sm", stage.state === "skipped" && "opacity-55")}
            style={{ borderColor: reached ? stage.color : undefined, background: stage.state === "current" ? `color-mix(in srgb, ${stage.color} 10%, white)` : undefined }}
          >
            <span className="block h-1.5 rounded-full" style={{ background: reached ? stage.color : "var(--muted)" }} />
            <span className="mt-1.5 flex items-center gap-1 text-xs font-bold">
              {stage.state === "done" ? <CheckIcon className="size-3 shrink-0" style={{ color: stage.color }} /> : null}
              <span className="truncate">{stage.label}</span>
            </span>
            <span className="block truncate text-[11px] font-semibold" style={{ color: stage.state === "next" ? "var(--muted-foreground)" : stage.color }}>
              {stage.state === "current" && (!stage.hint || stage.hint === "сейчас") ? "сейчас" : stage.hint === "✓" ? "готово" : stage.hint || " "}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Services({ project }: { project: CrmProjectDetails }) {
  if (!project.lines.length) return <p className="text-muted-foreground text-sm">Услуги ещё не добавлены.</p>;
  return (
    <ul className="grid gap-2">
      {project.lines.map((line) => (
        <li key={line.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-lg border p-3">
          <div className="min-w-0">
            <b className="block truncate text-sm">{line.name}</b>
            <span className="text-muted-foreground block text-xs">
              {line.qty > 0 ? `${line.qty.toLocaleString("ru-RU")} ${line.unit}` : "объём не задан"}
              {line.crew.length ? ` · ${line.crew.join(", ")}` : ""}
            </span>
            {line.installationAt ? <span className="text-muted-foreground block text-xs">Монтаж: {dateTime(line.installationAt)}</span> : null}
          </div>
          <div className="flex flex-col items-end gap-1">
            {project.canSeeMoney && line.price > 0 ? <b className="text-sm tabular-nums">{money(line.price)}</b> : null}
            <Pill tone={line.status === "done" ? "ok" : line.status === "in_progress" ? "info" : "muted"}>
              {line.status === "done" ? "выполнена" : line.status === "in_progress" ? "в работе" : "запланирована"}
            </Pill>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Tour of the site: photos with the windows marked on them, as in the approved demo. */
function Tour({ project, onOpenCard }: { project: CrmProjectDetails; onOpenCard: () => void }) {
  const [photoId, setPhotoId] = useState("");
  const [selected, setSelected] = useState("");
  const photo = project.photos.find((item) => item.id === photoId) ?? project.photos[0];
  const windows = photo ? [...project.windows].sort((a, b) => Number(b.roomId === photo.roomId) - Number(a.roomId === photo.roomId)) : project.windows;
  const marked = new Set(photo?.marks.map((mark) => mark.key));

  const list = windows.length ? (
    <ul className="grid content-start gap-2">
      {windows.map((item) => (
        <li key={item.key}>
          <button
            type="button"
            onClick={() => setSelected(selected === item.key ? "" : item.key)}
            className={cn("w-full rounded-lg border p-3 text-left transition-colors", selected === item.key ? "border-primary bg-accent" : "hover:bg-accent/60")}
          >
            <b className="block truncate text-sm">
              {item.room} · {item.name}
            </b>
            <span className="text-muted-foreground block text-xs">
              {item.size} · {item.sqft > 0 ? `${item.sqft.toFixed(1)} sq ft` : "нет площади"}
            </span>
            <span className="text-muted-foreground block truncate text-xs">{item.film}</span>
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              <Pill tone={item.verified ? "ok" : "warn"}>{item.verified ? "замер проверен" : "со слов клиента"}</Pill>
              {marked.has(item.key) ? <Pill tone="info">на фото</Pill> : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-muted-foreground text-sm">В проекте ещё нет окон.</p>
  );

  if (!photo) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="bg-muted/60 flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center">
          <b>Фото объекта пока нет</b>
          <p className="text-muted-foreground text-sm">Добавьте фото в карточке проекта — оно появится здесь, и на нём можно отметить окна точками.</p>
          <Button variant="outline" size="sm" onClick={onOpenCard}>
            Добавить фото
          </Button>
        </div>
        {list}
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div>
        <div className="bg-muted relative overflow-hidden rounded-lg border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt="Фото объекта" className="block w-full" />
          {photo.marks.map((mark) => (
            <button
              key={mark.key}
              type="button"
              aria-label="Окно на фото"
              onClick={() => setSelected(selected === mark.key ? "" : mark.key)}
              className={cn(
                "absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md transition-transform",
                selected === mark.key ? "bg-primary scale-125" : "bg-primary/70",
              )}
              style={{ left: `${mark.x}%`, top: `${mark.y}%` }}
            />
          ))}
        </div>
        {project.photos.length > 1 ? (
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
            {project.photos.map((item) => (
              <button key={item.id} type="button" onClick={() => setPhotoId(item.id)} className={cn("size-16 shrink-0 overflow-hidden rounded-md border-2", item.id === photo.id ? "border-primary" : "border-transparent")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
        <p className="text-muted-foreground mt-2 text-xs">Нажмите на точку или на окно в списке. Точки ставятся в рабочей карточке.</p>
      </div>
      {list}
    </div>
  );
}

export default function CrmProjectPageView({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const { data, error, loading, reload } = useCrmData<CrmProjectPage>(`/api/v1/crm-ui/projects/${encodeURIComponent(projectId)}`);
  const project = data?.project ?? null;
  const [cardOpen, setCardOpen] = useState(false);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  // Whatever was done in the working card is on this screen as soon as the card is closed.
  const toggleCard = (open: boolean) => {
    setCardOpen(open);
    if (!open) void reload();
  };

  return (
    <>
      <Link href="/crm/projects" className="text-muted-foreground hover:text-foreground mb-2 inline-flex min-h-8 items-center gap-1 text-sm font-medium">
        <ArrowLeftIcon className="size-4" /> Проекты
      </Link>
      <PageHeader title={project?.client.name ?? "Проект"} sub={project ? `${project.number} · ${project.status}` : undefined} loading={loading} onReload={() => void reload()}>
        {project ? (
          <Button onClick={() => setCardOpen(true)}>
            Рабочая карточка <PanelRightOpenIcon />
          </Button>
        ) : null}
      </PageHeader>
      <LoadError message={error} />
      {!data && loading ? <LoadingBlock /> : null}
      {data && !project ? <p className="text-muted-foreground text-sm">Проект не найден или недоступен.</p> : null}
      {project ? (
        <div className="grid gap-4" ref={(node) => setRoot(node?.closest<HTMLElement>(".rp-crm") ?? null)}>
          <Sheet open={cardOpen} onOpenChange={toggleCard}>
            <SheetContent side="right" container={root} className="w-full gap-0 p-0 sm:max-w-none lg:w-[min(1200px,calc(100vw-16rem))]">
              <SheetHeader className="border-b py-3 pr-12">
                <SheetTitle className="truncate">{project.client.name}</SheetTitle>
                <SheetDescription>Рабочая карточка проекта: все действия — здесь</SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1">{cardOpen ? <WorkingFrame src={legacyProjectHref(project.id)} title="Рабочая карточка проекта" /> : null}</div>
            </SheetContent>
          </Sheet>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {project.client.phone ? (
              <a href={`tel:${project.client.phone}`} className="text-primary inline-flex min-h-8 items-center gap-1.5 font-semibold">
                <PhoneIcon className="size-4" /> {project.client.phone}
              </a>
            ) : null}
            {project.client.address ? (
              <a href={`https://maps.google.com/?q=${encodeURIComponent(project.client.address)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1.5">
                <MapPinIcon className="text-muted-foreground size-4" /> {project.client.address}
              </a>
            ) : null}
            {project.manager ? <span className="text-muted-foreground inline-flex min-h-8 items-center">Менеджер: {project.manager}</span> : null}
            {project.measurer ? <span className="text-muted-foreground inline-flex min-h-8 items-center">Замерщик: {project.measurer}</span> : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <RingCard pct={project.stagePct} title={`${project.stageDone} из ${project.stageTotal}`} sub="этапов пройдено" />
            <RingCard pct={project.workPct} title={`${project.doneLines} из ${project.lines.length}`} sub="услуг выполнено" color="var(--info)" />
            <RingCard
              pct={project.windowCount ? Math.round((100 * project.sizedCount) / project.windowCount) : 0}
              title={`${project.sqft.toFixed(0)} sq ft`}
              sub={`${project.sizedCount} из ${project.windowCount} окон с размерами`}
              color="var(--warning)"
            />
            {project.canSeeMoney ? <RingCard pct={project.paidPct} title={money(project.paid)} sub={`оплачено из ${money(project.revenue)}`} color="#7d4fc4" /> : null}
          </div>

          <Card className="gap-3 py-5">
            <CardHeader className="px-5">
              <SectionTitle>Этапы проекта</SectionTitle>
            </CardHeader>
            <CardContent className="px-5">
              <StageLine stages={project.stages} />
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <Card className="border-primary/40 gap-3 py-5">
              <CardHeader className="px-5">
                <SectionTitle>Следующий шаг</SectionTitle>
              </CardHeader>
              <CardContent className="grid gap-3 px-5">
                {project.urgency ? (
                  <div>
                    <UrgencyPill label={project.urgency} />
                  </div>
                ) : null}
                <div>
                  <div className="text-lg leading-snug font-bold">{project.next?.title ?? "Проект под контролем"}</div>
                  {project.next?.sub ? <p className="text-muted-foreground mt-1 text-sm">{project.next.sub}</p> : null}
                </div>
                <Button size="lg" className="w-full sm:w-auto sm:justify-self-start" onClick={() => setCardOpen(true)}>
                  Сделать сейчас
                </Button>
              </CardContent>
            </Card>
            <Card className="gap-3 py-5">
              <CardHeader className="px-5">
                <SectionTitle>Услуги проекта</SectionTitle>
              </CardHeader>
              <CardContent className="px-5">
                <Services project={project} />
              </CardContent>
            </Card>
          </div>

          <Card className="gap-3 py-5">
            <CardHeader className="px-5">
              <SectionTitle>Тур по объекту{project.photos.length > 1 ? ` · ${project.photos.length} фото` : ""}</SectionTitle>
            </CardHeader>
            <CardContent className="px-5">
              <Tour project={project} onOpenCard={() => setCardOpen(true)} />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
