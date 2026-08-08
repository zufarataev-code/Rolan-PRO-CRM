import type { ReferenceLocale } from "@/lib/reference/locale";
import { resolveReferenceLabel } from "@/lib/reference/locale";
import { prisma } from "@/lib/db";

function withLabel<T extends Record<string, unknown>>(items: T[], locale: ReferenceLocale) {
  return items.map((item) => ({
    ...item,
    label: resolveReferenceLabel(item, locale),
  }));
}

export async function getSettingsBootstrap(locale: ReferenceLocale) {
  const [
    roles,
    service_types,
    service_field_config,
    service_addons,
    film_catalog,
    pipeline_statuses,
    project_statuses,
    payment_statuses,
    position_statuses,
    event_types,
    event_tracks,
    complexity_levels,
    cities,
    document_types,
  ] = await Promise.all([
    prisma.role.findMany({ where: { is_active: true }, orderBy: { sort_order: "asc" } }),
    prisma.serviceType.findMany({ where: { is_active: true }, orderBy: { sort_order: "asc" } }),
    prisma.serviceFieldConfig.findMany({
      where: { is_active: true },
      orderBy: [{ service_type_id: "asc" }, { sort_order: "asc" }],
    }),
    prisma.serviceAddon.findMany({
      where: { is_active: true },
      orderBy: [{ service_type_id: "asc" }, { sort_order: "asc" }],
    }),
    prisma.filmCatalog.findMany({ where: { is_active: true }, orderBy: { sort_order: "asc" } }),
    prisma.pipelineStatus.findMany({ where: { is_active: true }, orderBy: { sort_order: "asc" } }),
    prisma.projectStatus.findMany({ where: { is_active: true }, orderBy: { sort_order: "asc" } }),
    prisma.paymentStatus.findMany({ where: { is_active: true }, orderBy: { sort_order: "asc" } }),
    prisma.positionStatus.findMany({ where: { is_active: true }, orderBy: { sort_order: "asc" } }),
    prisma.eventType.findMany({ where: { is_active: true }, orderBy: { sort_order: "asc" } }),
    prisma.eventTrack.findMany({ where: { is_active: true }, orderBy: { sort_order: "asc" } }),
    prisma.complexityLevel.findMany({ where: { is_active: true }, orderBy: { sort_order: "asc" } }),
    prisma.city.findMany({ where: { is_active: true }, orderBy: { sort_order: "asc" } }),
    prisma.documentType.findMany({ where: { is_active: true }, orderBy: { sort_order: "asc" } }),
  ]);

  return {
    roles: withLabel(roles, locale),
    service_types: withLabel(service_types, locale),
    service_field_config,
    service_addons: withLabel(service_addons, locale),
    film_catalog: withLabel(film_catalog, locale),
    pipeline_statuses: withLabel(pipeline_statuses, locale),
    project_statuses: withLabel(project_statuses, locale),
    payment_statuses: withLabel(payment_statuses, locale),
    position_statuses: withLabel(position_statuses, locale),
    event_types: withLabel(event_types, locale),
    event_tracks: withLabel(event_tracks, locale),
    complexity_levels: withLabel(complexity_levels, locale),
    cities: withLabel(cities, locale),
    document_types: withLabel(document_types, locale),
  };
}
