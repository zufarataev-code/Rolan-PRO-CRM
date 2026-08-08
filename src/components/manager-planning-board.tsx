"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

import { ManagerPlanningMap } from "@/components/manager-planning-map";
import type {
  ManagerPlanningData,
  ManagerPlanningDay,
  ManagerPlanningItem,
  PlanningViewMode,
} from "@/features/calendar/service";

type ManagerPlanningBoardProps = {
  data: ManagerPlanningData;
};

const COLOR_STYLES: Record<string, { accent: string; surface: string; ink: string }> = {
  yellow: {
    accent: "#d29a2e",
    surface: "rgba(255, 234, 186, 0.82)",
    ink: "#7d5700",
  },
  green: {
    accent: "#2b9a6b",
    surface: "rgba(198, 245, 223, 0.82)",
    ink: "#0f5f3e",
  },
  blue: {
    accent: "#3478f6",
    surface: "rgba(214, 230, 255, 0.82)",
    ink: "#14439b",
  },
  red: {
    accent: "#cc533a",
    surface: "rgba(255, 220, 212, 0.84)",
    ink: "#8a2c1a",
  },
  slate: {
    accent: "#6d7789",
    surface: "rgba(229, 232, 239, 0.82)",
    ink: "#455063",
  },
};

function getTone(colorToken: string) {
  return COLOR_STYLES[colorToken] ?? COLOR_STYLES.blue;
}

function buildDirectionsHref(items: ManagerPlanningItem[]) {
  const addresses = items
    .map((item) => item.address?.trim() ?? "")
    .filter((address): address is string => address.length > 0);

  if (addresses.length === 0) {
    return null;
  }

  if (addresses.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addresses[0])}`;
  }

  const origin = addresses[0];
  const destination = addresses[addresses.length - 1];
  const waypoints = addresses.slice(1, -1);
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving",
  });

  if (waypoints.length) {
    params.set("waypoints", waypoints.join("|"));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function buildDestinationRouteHref(address: string | null) {
  if (!address?.trim()) {
    return null;
  }

  const params = new URLSearchParams({
    api: "1",
    destination: address.trim(),
    travelmode: "driving",
  });

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function normalizeTagInput(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function formatDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftAnchorDate(dateKey: string, viewMode: PlanningViewMode, direction: number) {
  const next = new Date(`${dateKey}T12:00:00`);

  if (Number.isNaN(next.getTime())) {
    return formatDateKey(new Date());
  }

  if (viewMode === "day") {
    next.setDate(next.getDate() + direction);
  } else if (viewMode === "month") {
    next.setMonth(next.getMonth() + direction);
  } else {
    next.setDate(next.getDate() + direction * 7);
  }

  return formatDateKey(next);
}

function buildCalendarHref(viewMode: PlanningViewMode, anchorDate: string) {
  const params = new URLSearchParams({
    view: viewMode,
    date: anchorDate,
  });

  return `/manager/calendar?${params.toString()}`;
}

function filterItem(item: ManagerPlanningItem, kind: string, query: string, status: string) {
  if (kind !== "all" && item.entity_type !== kind) {
    return false;
  }

  if (status === "attention" && !item.problem_flag) {
    return false;
  }

  if (status !== "all" && status !== "attention" && item.status_code !== status) {
    return false;
  }

  if (!query) {
    return true;
  }

  const haystack = [item.title, item.subtitle, item.address ?? "", item.tags.join(" "), item.assignee_label ?? "", item.crew_label ?? ""]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

export function ManagerPlanningBoard({ data }: ManagerPlanningBoardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [days, setDays] = useState<ManagerPlanningDay[]>(data.days);
  const [selectedDate, setSelectedDate] = useState<string>(data.anchor_date);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(data.days.flatMap((day) => day.items)[0]?.item_id ?? null);
  const [kindFilter, setKindFilter] = useState<"all" | "consultation" | "installation">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const viewMode = data.view_mode;

  useEffect(() => {
    setDays(data.days);
    setSelectedDate(data.anchor_date);
    setSelectedItemId(data.days.flatMap((day) => day.items)[0]?.item_id ?? null);
  }, [data.anchor_date, data.days]);

  const filteredDays = useMemo(() => {
    const query = search.trim();
    return days.map((day) => ({
      ...day,
      items: day.items.filter((item) => filterItem(item, kindFilter, query, statusFilter)),
    }));
  }, [days, kindFilter, search, statusFilter]);

  const selectedDay = useMemo(() => {
    return filteredDays.find((day) => day.date_key === selectedDate) ?? filteredDays[0] ?? null;
  }, [filteredDays, selectedDate]);

  const selectedDayItems = selectedDay?.items ?? [];

  useEffect(() => {
    if (!selectedDay) {
      return;
    }

    const itemExists = selectedDay.items.some((item) => item.item_id === selectedItemId);

    if (!itemExists) {
      setSelectedItemId(selectedDay.items[0]?.item_id ?? null);
    }
  }, [selectedDay, selectedItemId]);

  const selectedItem = useMemo(() => {
    const allItems = filteredDays.flatMap((day) => day.items);
    return allItems.find((item) => item.item_id === selectedItemId) ?? allItems[0] ?? null;
  }, [filteredDays, selectedItemId]);

  const routeItems = useMemo(() => {
    return [...selectedDayItems].sort((left, right) => left.starts_at.localeCompare(right.starts_at));
  }, [selectedDayItems]);

  const routeHref = useMemo(() => buildDirectionsHref(routeItems), [routeItems]);
  const selectedRouteHref = useMemo(() => buildDestinationRouteHref(selectedItem?.address ?? null), [selectedItem]);

  const metrics = useMemo(() => {
    const items = filteredDays.flatMap((day) => day.items);
    return {
      total: items.length,
      consultations: items.filter((item) => item.entity_type === "consultation").length,
      installations: items.filter((item) => item.entity_type === "installation").length,
      flagged: items.filter((item) => item.problem_flag).length,
      with_tags: items.filter((item) => item.tags.length > 0).length,
    };
  }, [filteredDays]);

  const statusOptions = useMemo(() => {
    const options = new Map<string, string>();

    days.flatMap((day) => day.items).forEach((item) => {
      if (!options.has(item.status_code)) {
        options.set(item.status_code, item.status_label);
      }
    });

    return [
      { value: "all", label: "Все статусы" },
      { value: "attention", label: "Attention" },
      ...Array.from(options.entries()).map(([value, label]) => ({ value, label })),
    ];
  }, [days]);

  function navigateCalendar(nextViewMode: PlanningViewMode, nextAnchorDate: string) {
    startTransition(() => {
      router.replace(buildCalendarHref(nextViewMode, nextAnchorDate), { scroll: false });
    });
  }

  function updateLocalTags(target: ManagerPlanningItem, nextTags: string[]) {
    setDays((current) =>
      current.map((day) => ({
        ...day,
        items: day.items.map((item) => (item.item_id === target.item_id ? { ...item, tags: nextTags } : item)),
      })),
    );
  }

  function saveTags(target: ManagerPlanningItem, nextTags: string[]) {
    startTransition(async () => {
      const response = await fetch("/api/v1/planning/tags", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entity_type: target.entity_type,
          entity_id: target.entity_id,
          tags: nextTags,
        }),
      });

      if (!response.ok) {
        return;
      }

      updateLocalTags(target, nextTags);
      router.refresh();
    });
  }

  function addDraftTag() {
    if (!selectedItem) {
      return;
    }

    const normalized = normalizeTagInput(tagDraft);

    if (!normalized) {
      return;
    }

    const nextTags = Array.from(new Set([...selectedItem.tags, normalized])).slice(0, 12);
    setTagDraft("");
    saveTags(selectedItem, nextTags);
  }

  function removeTag(tag: string) {
    if (!selectedItem) {
      return;
    }

    saveTags(
      selectedItem,
      selectedItem.tags.filter((item) => item !== tag),
    );
  }

  function toggleQuickTag(tag: string) {
    if (!selectedItem) {
      return;
    }

    const nextTags = selectedItem.tags.includes(tag)
      ? selectedItem.tags.filter((item) => item !== tag)
      : Array.from(new Set([...selectedItem.tags, tag])).slice(0, 12);

    saveTags(selectedItem, nextTags);
  }

  return (
    <section className="workspace">
      <section className="workspace-hero">
        <div className="metric-grid">
          <div className="metric-cell">
            <div className="metric-label">Всего событий</div>
            <div className="metric-value">{metrics.total}</div>
            <div className="metric-footnote">Консультации + монтажи в недельном окне</div>
          </div>
          <div className="metric-cell">
            <div className="metric-label">Консультации</div>
            <div className="metric-value">{metrics.consultations}</div>
            <div className="metric-footnote">Survey и re-measure</div>
          </div>
          <div className="metric-cell">
            <div className="metric-label">Монтажи</div>
            <div className="metric-value">{metrics.installations}</div>
            <div className="metric-footnote">Schedule assignments по проектам</div>
          </div>
          <div className="metric-cell">
            <div className="metric-label">Attention</div>
            <div className="metric-value">{metrics.flagged}</div>
            <div className="metric-footnote">Problem flag и горячие точки</div>
          </div>
        </div>

        <div className="kpi-ribbon">
          <div className="kpi-pill">
            <span>Текущий диапазон</span>
            <strong>{data.range_label}</strong>
          </div>
          <div className="kpi-pill">
            <span>С тегами</span>
            <strong>{metrics.with_tags}</strong>
          </div>
          <Link href="/manager/projects" className="soft-button">
            Открыть проекты
          </Link>
        </div>
      </section>

      <section className="surface">
        <div className="planning-viewbar">
          <div className="project-inline-chips">
            {[
              { key: "day", label: "День" },
              { key: "week", label: "Неделя" },
              { key: "month", label: "Месяц" },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                className={`chip chip-button${viewMode === option.key ? " chip-accent" : ""}`}
                onClick={() => navigateCalendar(option.key as PlanningViewMode, selectedDate)}
                disabled={isPending}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="planning-range-nav">
            <button
              type="button"
              className="soft-button"
              onClick={() => navigateCalendar(viewMode, shiftAnchorDate(selectedDate, viewMode, -1))}
              disabled={isPending}
            >
              ← Назад
            </button>
            <div className="kpi-pill">
              <span>{viewMode === "day" ? "Выбранный день" : viewMode === "week" ? "Выбранная неделя" : "Выбранный месяц"}</span>
              <strong>{data.range_label}</strong>
            </div>
            <button
              type="button"
              className="soft-button"
              onClick={() => navigateCalendar(viewMode, formatDateKey(new Date()))}
              disabled={isPending}
            >
              Сегодня
            </button>
            <button
              type="button"
              className="soft-button"
              onClick={() => navigateCalendar(viewMode, shiftAnchorDate(selectedDate, viewMode, 1))}
              disabled={isPending}
            >
              Вперед →
            </button>
          </div>
        </div>

        <div className="planning-toolbar">
          <div className="planning-toolbar-controls">
            <div className="project-inline-chips">
              {[
                { key: "all", label: "Все" },
                { key: "consultation", label: "Консультации" },
                { key: "installation", label: "Монтажи" },
              ].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`chip chip-button${kindFilter === option.key ? " chip-accent" : ""}`}
                  onClick={() => setKindFilter(option.key as typeof kindFilter)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <select className="planning-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <input
              className="planning-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по клиенту, адресу, crew, тегу"
            />
          </div>
        </div>
      </section>

      <section className="surface planning-grid-surface">
        <div className={`planning-grid planning-grid-${viewMode}`}>
          {filteredDays.map((day) => (
            <article
              key={day.date_key}
              className={`planning-day-column${selectedDate === day.date_key ? " planning-day-column-active" : ""}${
                day.is_in_primary_range ? "" : " planning-day-column-muted"
              }`}
              onClick={() => setSelectedDate(day.date_key)}
            >
              <header className="planning-column-header">
                <div>
                  <div className="row-title">{day.label}</div>
                  <div className="row-meta">
                    {day.full_label}
                    {day.is_today ? " • Сегодня" : ""}
                  </div>
                </div>
                <span className="chip">{day.items.length}</span>
              </header>

              <div className="planning-column-body">
                {day.items.length === 0 ? (
                  <div className="empty-state">Событий нет.</div>
                ) : (
                  day.items.map((item) => {
                    const tone = getTone(item.color_token);

                    return (
                      <button
                        key={item.item_id}
                        type="button"
                        className={`planning-card${selectedItem?.item_id === item.item_id ? " planning-card-active" : ""}`}
                        style={
                          {
                            "--planning-accent": tone.accent,
                            "--planning-surface": tone.surface,
                            "--planning-ink": tone.ink,
                          } as CSSProperties
                        }
                        onClick={() => {
                          setSelectedDate(day.date_key);
                          setSelectedItemId(item.item_id);
                        }}
                      >
                        <div className="planning-card-topline">
                          <span className="planning-kind">{item.kind_label}</span>
                          <span className="planning-time">{item.time_label}</span>
                        </div>
                        <div className="planning-card-title">{item.title}</div>
                        <div className="planning-card-subtitle">{item.subtitle}</div>
                        <div className="planning-card-statuses">
                          <span className="chip">{item.status_label}</span>
                          {item.problem_flag ? <span className="chip chip-danger">attention</span> : null}
                        </div>
                        <div className="row-meta">{item.address ?? "Адрес не указан"}</div>
                        {item.tags.length ? (
                          <div className="planning-tag-row">
                            {item.tags.map((tag) => (
                              <span key={tag} className="planning-tag">
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="planning-map-layout">
        <section className="surface planning-map-surface">
          <div className="planning-map-surface-head">
            <div>
              <h2 className="surface-title">Google Map</h2>
              <p className="surface-subtitle">
                Большая карта под карточками: консультации и монтажи выбранного дня отображаются как наши точки, а по
                клику видны адрес и теги.
              </p>
            </div>
            {routeHref ? (
              <a href={routeHref} target="_blank" rel="noreferrer" className="soft-button">
                Маршрут в Google Maps
              </a>
            ) : null}
          </div>

          <ManagerPlanningMap
            items={selectedDayItems}
            selectedItemId={selectedItem?.item_id ?? null}
            onSelectItem={(itemId) => setSelectedItemId(itemId)}
          />
        </section>

        <aside className="planning-sidebar">
          <section className="surface">
            <h2 className="surface-title">Выбранное событие</h2>
            {selectedItem ? (
              <div className="inspector-list">
                <div className="inspector-item inspector-item-hero">
                  <div className="project-inline-chips">
                    <span className="chip chip-accent">{selectedItem.kind_label}</span>
                    <span className="chip">{selectedItem.status_label}</span>
                  </div>
                  <div className="row-title">{selectedItem.title}</div>
                  <div className="row-meta">{selectedItem.subtitle}</div>
                  <div className="row-meta">
                    {selectedItem.day_label} • {selectedItem.time_label}
                  </div>
                  <div className="row-meta">{selectedItem.address ?? "Адрес не указан"}</div>
                </div>

                {selectedItem.assignee_label ? (
                  <div className="inspector-item inspector-item-context">
                    <div className="row-title">Консультант</div>
                    <div className="row-meta">{selectedItem.assignee_label}</div>
                  </div>
                ) : null}

                {selectedItem.crew_label ? (
                  <div className="inspector-item inspector-item-context">
                    <div className="row-title">Crew</div>
                    <div className="row-meta">{selectedItem.crew_label}</div>
                    <div className="row-meta">
                      {selectedItem.installer_labels.length
                        ? selectedItem.installer_labels.join(", ")
                        : "Монтажники назначены по проекту"}
                    </div>
                  </div>
                ) : null}

                <div className="inspector-item inspector-item-tags">
                  <div className="row-title">Теги планирования</div>
                  <div className="planning-tag-row">
                    {selectedItem.tags.length ? (
                      selectedItem.tags.map((tag) => (
                        <button key={tag} type="button" className="planning-tag planning-tag-remove" onClick={() => removeTag(tag)}>
                          {tag} ×
                        </button>
                      ))
                    ) : (
                      <span className="row-meta">Тегов пока нет.</span>
                    )}
                  </div>
                  <div className="planning-tag-editor">
                    <input
                      value={tagDraft}
                      onChange={(event) => setTagDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addDraftTag();
                        }
                      }}
                      placeholder="Добавить тег"
                    />
                    <button type="button" className="soft-button" onClick={addDraftTag} disabled={isPending}>
                      Добавить
                    </button>
                  </div>
                  <div className="planning-quick-tags">
                    {data.quick_tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={`chip chip-button${selectedItem.tags.includes(tag) ? " chip-accent" : ""}`}
                        onClick={() => toggleQuickTag(tag)}
                        disabled={isPending}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="inspector-item inspector-item-actions">
                  <div className="row-title">Действия</div>
                  <div className="planning-action-row">
                    <Link href={selectedItem.detail_href} className="accent-button">
                      Открыть карточку
                    </Link>
                    {selectedRouteHref ? (
                      <a href={selectedRouteHref} target="_blank" rel="noreferrer" className="soft-button">
                        Маршрут к точке
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">Выбери событие в графике, чтобы увидеть детали и карту.</div>
            )}
          </section>

          <section className="surface">
            <h2 className="surface-title">Маршрут дня</h2>
            <p className="surface-subtitle">
              Route planner собирает консультации и монтажи выбранного дня по времени, чтобы менеджеру было удобно
              планировать порядок выездов.
            </p>

            {routeItems.length === 0 ? (
              <div className="empty-state">На выбранный день нет событий.</div>
            ) : (
              <>
                <div className="planning-route-list">
                  {routeItems.map((item, index) => (
                    <div key={item.item_id} className="planning-route-stop">
                      <div className="planning-route-number">{index + 1}</div>
                      <div>
                        <div className="row-title">
                          {item.time_label} • {item.title}
                        </div>
                        <div className="row-meta">{item.address ?? "Адрес не указан"}</div>
                        <div className="project-inline-chips">
                          <span className="chip">{item.kind_label}</span>
                          {item.crew_label ? <span className="chip">{item.crew_label}</span> : null}
                          {item.assignee_label ? <span className="chip">{item.assignee_label}</span> : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="planning-action-row">
                  {routeHref ? (
                    <a href={routeHref} target="_blank" rel="noreferrer" className="accent-button">
                      Построить маршрут
                    </a>
                  ) : null}
                  {selectedDay?.items.length ? (
                    <span className="chip chip-accent">{selectedDay.full_label}</span>
                  ) : null}
                </div>
              </>
            )}
          </section>
        </aside>
      </section>
    </section>
  );
}
