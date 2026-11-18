"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeftIcon, CheckIcon, ExternalLinkIcon, InfoIcon, MapPinIcon, PhoneIcon, RefreshCwIcon, RulerIcon, TriangleAlertIcon } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { formatVisit, useFieldData } from "@/features/field-measure/use-field-data";
import type { FieldMeasureDetail } from "@/features/field-measure/view";

export default function FieldMeasureProjectPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { data, error, loading, reload } = useFieldData<{ project: FieldMeasureDetail }>(`/api/v1/field/measure/${encodeURIComponent(orderId)}`);
  const project = data?.project;
  const unit = project?.units === "mm" ? "мм" : "in";

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4 pb-16">
      <header className="flex items-center justify-between gap-3">
        <Button variant="ghost" asChild>
          <Link href="/field/measure"><ArrowLeftIcon data-icon="inline-start" />Замеры</Link>
        </Button>
        <Button variant="outline" size="icon" aria-label="Обновить" disabled={loading} onClick={() => void reload()}>
          {loading ? <Spinner /> : <RefreshCwIcon />}
        </Button>
      </header>

      {error && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Проект не открылся</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {project && (
        <>
          <Card>
            <CardHeader>
              <CardDescription>Проект {project.number}</CardDescription>
              <CardTitle className="text-xl">{project.clientName}</CardTitle>
              <CardDescription>{formatVisit(project.measurementAt)}</CardDescription>
              <CardAction>
                <Badge variant={project.status === "measurement_done" ? "secondary" : "default"}>{project.statusLabel}</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm">{project.address || "Адрес не указан"}</p>
              <div className="flex flex-wrap gap-2">
                {project.address && (
                  <Button variant="outline" asChild>
                    <a href={`https://maps.apple.com/?q=${encodeURIComponent(project.address)}`} target="_blank" rel="noreferrer"><MapPinIcon data-icon="inline-start" />Маршрут</a>
                  </Button>
                )}
                {project.phone && (
                  <Button variant="outline" asChild>
                    <a href={`tel:${project.phone.replace(/[^+\d]/g, "")}`}><PhoneIcon data-icon="inline-start" />{project.phone}</a>
                  </Button>
                )}
              </div>
              {project.notes && <p className="text-muted-foreground text-sm">{project.notes}</p>}
            </CardContent>
          </Card>

          <Alert>
            <InfoIcon />
            <AlertTitle>Пока только просмотр</AlertTitle>
            <AlertDescription>Размеры вносятся в рабочей CRM. Ввод на этом экране — следующий шаг.</AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Итог по услугам</CardTitle>
              <CardDescription>Площадь считается так же, как в карточке проекта</CardDescription>
              <CardAction><Badge variant="secondary">окон: {project.windowCount} · {project.totalSqft} sq ft</Badge></CardAction>
            </CardHeader>
            <CardContent>
              {project.services.length === 0 ? (
                <p className="text-muted-foreground text-sm">Окон пока нет.</p>
              ) : (
                <ItemGroup>
                  {project.services.map((service) => (
                    <Item key={service.name} size="sm" className="px-0">
                      <ItemContent><ItemTitle>{service.name}</ItemTitle><ItemDescription>окон: {service.windows}</ItemDescription></ItemContent>
                      <ItemActions><span className="font-semibold">{service.sqft} sq ft</span></ItemActions>
                    </Item>
                  ))}
                </ItemGroup>
              )}
            </CardContent>
            {project.sizesMissing > 0 && (
              <CardFooter>
                <Badge variant="destructive">Без размеров: {project.sizesMissing}</Badge>
              </CardFooter>
            )}
          </Card>

          {project.rooms.length === 0 ? (
            <Empty className="bg-card border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><RulerIcon /></EmptyMedia>
                <EmptyTitle>Замер ещё не начат</EmptyTitle>
                <EmptyDescription>В проекте нет ни одного помещения и окна.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Card>
              <CardHeader><CardTitle>Помещения и окна</CardTitle></CardHeader>
              <CardContent>
                <Accordion type="multiple" defaultValue={project.rooms.map((room) => room.id)}>
                  {project.rooms.map((room) => (
                    <AccordionItem key={room.id} value={room.id}>
                      <AccordionTrigger>
                        <span className="flex flex-1 items-center justify-between gap-2">
                          <span>{room.name}</span>
                          <span className="text-muted-foreground text-sm font-normal">окон: {room.windows.length} · {room.sqft} sq ft</span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <ItemGroup className="gap-2">
                          {room.windows.map((win) => (
                            <Item key={win.id} variant="outline" size="sm">
                              <ItemContent>
                                <ItemTitle>{win.name}{win.verified && <CheckIcon className="text-success size-4" aria-label="Проверено замерщиком" />}</ItemTitle>
                                <ItemDescription>{[win.type, win.service, win.film || (win.filmOnSite ? "плёнку клиент выберет на месте" : "")].filter(Boolean).join(" · ")}</ItemDescription>
                                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                  {win.sizeEntered
                                    ? <Badge variant="outline" className="text-sm tabular-nums">{win.width} × {win.height} {unit}{win.qty > 1 ? ` × ${win.qty} шт` : ""}</Badge>
                                    : <Badge variant="destructive">размер не внесён</Badge>}
                                  {win.panels > 1 && <Badge variant="outline">панелей: {win.panels}</Badge>}
                                  {win.removal && <Badge variant="outline">снять старую плёнку</Badge>}
                                </div>
                                {win.notes && <p className="text-muted-foreground pt-1 text-sm">{win.notes}</p>}
                              </ItemContent>
                              <ItemActions><span className="font-semibold tabular-nums">{win.sqft} sq ft</span></ItemActions>
                            </Item>
                          ))}
                        </ItemGroup>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          )}

          <Button size="lg" asChild>
            <a href={`/legacy-crm#/order/${encodeURIComponent(project.id)}`}><ExternalLinkIcon data-icon="inline-start" />Открыть проект в рабочей CRM</a>
          </Button>
        </>
      )}
    </main>
  );
}
