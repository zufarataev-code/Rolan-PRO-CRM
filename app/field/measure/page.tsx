"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRightIcon, RefreshCwIcon, RulerIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatVisit, useFieldData } from "@/features/field-measure/use-field-data";
import type { FieldMeasureProject } from "@/features/field-measure/view";

export default function FieldMeasureListPage() {
  const { data, error, loading, reload } = useFieldData<{ projects: FieldMeasureProject[] }>("/api/v1/field/measure");
  const [scope, setScope] = useState("mine");
  const all = data?.projects ?? [];
  const hasOthers = all.some((project) => !project.mine);
  const projects = scope === "mine" && hasOthers ? all.filter((project) => project.mine) : all;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4 pb-16">
      <header className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold">Замеры</h1>
          <p className="text-muted-foreground text-sm">Проекты, где нужен или уже сделан замер</p>
        </div>
        <Button variant="outline" size="icon" aria-label="Обновить" disabled={loading} onClick={() => void reload()}>
          {loading ? <Spinner /> : <RefreshCwIcon />}
        </Button>
      </header>

      {hasOthers && (
        <ToggleGroup type="single" variant="outline" value={scope} aria-label="Чьи проекты" onValueChange={(value) => value && setScope(value)}>
          <ToggleGroupItem value="mine">Мои</ToggleGroupItem>
          <ToggleGroupItem value="all">Все</ToggleGroupItem>
        </ToggleGroup>
      )}

      {error && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Данные не загрузились</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!error && !loading && projects.length === 0 && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><RulerIcon /></EmptyMedia>
            <EmptyTitle>Замеров нет</EmptyTitle>
            <EmptyDescription>Когда менеджер назначит вам замер, проект появится здесь.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <ItemGroup className="gap-2">
        {projects.map((project) => (
          <Item key={project.id} variant="outline" className="bg-card" asChild>
            <Link href={`/field/measure/${encodeURIComponent(project.id)}`}>
              <ItemContent>
                <ItemTitle>{project.clientName}</ItemTitle>
                <ItemDescription>{project.address || "Адрес не указан"}</ItemDescription>
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <Badge variant={project.status === "measurement_done" ? "secondary" : "default"}>{project.statusLabel}</Badge>
                  <Badge variant="outline">{formatVisit(project.measurementAt)}</Badge>
                  {project.windowCount > 0 && <Badge variant="outline">окон: {project.windowCount} · {project.totalSqft} sq ft</Badge>}
                  {project.sizesMissing > 0 && <Badge variant="destructive">без размеров: {project.sizesMissing}</Badge>}
                </div>
              </ItemContent>
              <ItemActions>
                <span className="text-muted-foreground text-xs">{project.number}</span>
                <ChevronRightIcon className="text-muted-foreground" />
              </ItemActions>
            </Link>
          </Item>
        ))}
      </ItemGroup>
    </main>
  );
}
