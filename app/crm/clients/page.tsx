"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MailIcon, MapPinIcon, MessageCircleIcon, PhoneIcon, SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { money, plural } from "@/features/crm-shell/format";
import type { CrmClientRow, CrmClients } from "@/features/crm-shell/types";
import { LoadError, LoadingBlock, PageHeader, Pill } from "@/features/crm-shell/ui";
import { useCrmData } from "@/features/crm-shell/use-crm-data";
import { cn } from "@/lib/utils";

type Segment = "all" | "b2c" | "b2b" | "regular";

/** The working «Клиенты» section: adding a client, addresses, the portal and edits still live there. */
const LEGACY_CLIENTS = "/crm/section/clients";

function whatsappHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return "";
  return `https://wa.me/${digits.length === 10 ? `1${digits}` : digits}`;
}

function ClientCard({ client }: { client: CrmClientRow }) {
  const wa = whatsappHref(client.phone);
  return (
    <article className="bg-card min-w-0 rounded-lg border p-3 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <b className="block truncate text-sm">{client.name}</b>
          {client.representative ? <div className="text-muted-foreground truncate text-xs">{client.representative}</div> : null}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <Pill tone={client.b2b ? "info" : "muted"}>{client.b2b ? client.companyType || "B2B" : "B2C"}</Pill>
          {client.regular ? <Pill tone="ok">{client.relationship || "Постоянный"}</Pill> : null}
        </div>
      </div>

      <div className="mt-2 grid gap-1 text-xs">
        {client.phone ? (
          <div className="flex min-w-0 items-center gap-2">
            <PhoneIcon className="text-muted-foreground size-3.5 shrink-0" />
            <a href={`tel:${client.phone}`} className="hover:text-primary truncate font-medium">
              {client.phone}
            </a>
            {wa ? (
              <a href={wa} target="_blank" rel="noreferrer" className="text-success ml-auto flex shrink-0 items-center gap-1 font-semibold">
                <MessageCircleIcon className="size-3.5" />
                WhatsApp
              </a>
            ) : null}
          </div>
        ) : null}
        {client.email ? (
          <div className="flex min-w-0 items-center gap-2">
            <MailIcon className="text-muted-foreground size-3.5 shrink-0" />
            <a href={`mailto:${client.email}`} className="hover:text-primary truncate">
              {client.email}
            </a>
          </div>
        ) : null}
        {client.address ? (
          <div className="flex min-w-0 items-center gap-2">
            <MapPinIcon className="text-muted-foreground size-3.5 shrink-0" />
            <span className="truncate">{client.address}</span>
            {client.addresses > 1 ? <span className="text-muted-foreground shrink-0">+{client.addresses - 1}</span> : null}
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Pill>
          {client.projects} {plural(client.projects, "проект", "проекта", "проектов")}
        </Pill>
        {client.revenue > 0 ? <Pill tone="ok">{money(client.revenue)}</Pill> : null}
        {client.debt > 0 ? <Pill tone="warn">долг {money(client.debt)}</Pill> : null}
        {client.portal ? <Pill tone="info">Портал</Pill> : null}
      </div>

      {client.source || client.referredBy ? (
        <div className="text-muted-foreground mt-2 truncate text-xs">
          {client.source}
          {client.referredBy ? `${client.source ? " · " : ""}от ${client.referredBy}` : ""}
        </div>
      ) : null}

      {client.recent.length ? (
        <div className="mt-2 grid gap-1 border-t pt-2">
          {client.recent.map((project) => (
            <Link key={project.id} href={`/crm/projects/${encodeURIComponent(project.id)}`} className="hover:text-primary flex min-w-0 items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium">{project.number || "Проект"}</span>
              <span className="text-muted-foreground shrink-0">{project.status}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function CrmClientsPage() {
  const { data, error, loading, reload } = useCrmData<CrmClients>("/api/v1/crm-ui/clients");
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<Segment>("all");

  const clients = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    return data.clients.filter((client) => {
      if (segment === "b2c" && client.b2b) return false;
      if (segment === "b2b" && !client.b2b) return false;
      if (segment === "regular" && !client.regular) return false;
      return !needle || client.search.includes(needle);
    });
  }, [data, query, segment]);

  const owner = data?.user.role === "owner";
  const segments: Array<[Segment, string, number]> = data
    ? [
        ["all", owner ? "Все" : "Мои", data.counts.all],
        ["b2c", "B2C", data.counts.b2c],
        ["b2b", "B2B", data.counts.b2b],
        ["regular", "Постоянные", data.counts.regular],
      ]
    : [];

  return (
    <>
      <PageHeader title="Клиенты" sub={data ? `Всего: ${data.counts.all}` : "Карточки клиентов"} loading={loading} onReload={() => void reload()}>
        <Button asChild>
          <Link href={LEGACY_CLIENTS}>Новый клиент</Link>
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
              placeholder="Имя, компания, телефон или адрес"
              aria-label="Поиск клиента"
              className="placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>

          <div className="no-scrollbar -mx-3 mb-3 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:px-0" role="tablist" aria-label="Группы клиентов">
            {segments.map(([key, title, count]) => {
              const active = key === segment;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSegment(key)}
                  className={cn(
                    "flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-semibold",
                    active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground",
                  )}
                >
                  {title}
                  <span className={cn("tabular-nums", active ? "opacity-90" : "text-muted-foreground")}>{count}</span>
                </button>
              );
            })}
          </div>

          {clients.length ? (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {clients.map((client) => (
                <ClientCard key={client.id} client={client} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
              {query || segment !== "all" ? "Никого не нашлось" : "Клиентов пока нет"}
            </p>
          )}

          <div className="mt-4 flex justify-center">
            <Button asChild variant="ghost" size="sm" className="h-auto min-h-8 max-w-full py-1.5 text-center whitespace-normal">
              <Link href={LEGACY_CLIENTS}>Прежний экран: адреса, портал, правка</Link>
            </Button>
          </div>
        </>
      ) : null}
    </>
  );
}
