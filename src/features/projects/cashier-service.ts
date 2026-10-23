/**
 * Касса → проект в PostgreSQL.
 *
 * Загружает справочники в форму, понятную чистой кассе (cashier.ts), считает чек
 * и создаёт проект: по позиции на каждое направление, допы направлений,
 * консультацию + замер с окнами (чтобы модуль замера и КП работали с тем же
 * проектом), наряд монтажнику — отдельным шагом, как и раньше.
 *
 * Деньги: цена плёнки за sq ft хранится в позиции (base/min/actual), допы — в
 * ProjectPositionAddon, строки «общее по объекту» (удаление, техника, подрядчик)
 * — в допах основного направления и в снимке чека dynamic_fields.cashier_v1.
 */

import { Prisma } from "@prisma/client";

import { buildClientReuseWhere, getRecordManagerScope } from "@/features/sales/access";
import {
  ClientIdentityConflictError,
  ClientNotAccessibleError,
  findExistingClientByIdentity,
  lockClientIdentity,
  normalizeClientEmail,
} from "@/features/sales/client-identity";
import { ROLE_CODES } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";

import {
  buildCashierQuote,
  CASHIER_DIRECTIONS,
  type AccessLevel,
  type CashierAddon,
  type CashierCatalog,
  type CashierDirectionCode,
  type CashierFilm,
  type CashierInput,
  type CashierQuote,
  type FilmClass,
} from "./cashier";

type Session = { user: { user_id: string }; roles: string[] };

const decimalToNumber = (value: Prisma.Decimal | number | string | null | undefined) => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
};

const numberArray = (value: unknown): number[] | null => {
  if (!Array.isArray(value)) return null;
  const list = value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
  return list.length ? list : null;
};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export type CashierCatalogBundle = {
  catalog: CashierCatalog;
  directions: Array<{
    code: CashierDirectionCode;
    label_ru: string;
    color_token: string;
    service_type_id: string;
    film_types: Array<{ code: string; count: number }>;
    brands: Array<{ code: string; name_ru: string }>;
  }>;
  service_type_ids: Partial<Record<CashierDirectionCode, string>>;
  removal_addon_ids: Partial<Record<CashierDirectionCode, string>>;
};

/** Справочники для кассы из PostgreSQL. Остатки склада пока из legacy, здесь — null (неизвестно). */
export async function loadCashierCatalog(): Promise<CashierCatalogBundle> {
  const [serviceTypes, films, addons, accessLevels] = await Promise.all([
    prisma.serviceType.findMany({ where: { is_active: true } }),
    prisma.filmCatalog.findMany({ where: { is_active: true }, orderBy: [{ sort_order: "asc" }, { model_name_ru: "asc" }] }),
    prisma.serviceAddon.findMany({ where: { is_active: true }, orderBy: [{ sort_order: "asc" }] }),
    prisma.accessLevel.findMany({ where: { is_active: true }, orderBy: [{ sort_order: "asc" }] }),
  ]);

  const serviceByCode = new Map(serviceTypes.map((item) => [item.service_code, item]));
  const serviceById = new Map(serviceTypes.map((item) => [item.service_type_id, item]));
  const serviceTypeIds: Partial<Record<CashierDirectionCode, string>> = {};
  const installation: Partial<Record<CashierDirectionCode, number>> = {};
  for (const direction of CASHIER_DIRECTIONS) {
    const service = serviceByCode.get(direction.code);
    if (!service) continue;
    serviceTypeIds[direction.code] = service.service_type_id;
    installation[direction.code] = decimalToNumber(service.installation_cost_per_sqft) ?? 0;
  }

  const cashierFilms: CashierFilm[] = films.map((film) => ({
    film_id: film.film_id,
    category_code: film.category_code,
    film_type_code: film.film_type_code ?? null,
    film_class: (film.film_class === "premium" ? "premium" : "standard") as FilmClass,
    brand_code: film.brand_code,
    model_name: `${film.brand_name_ru} ${film.model_name_ru}`.trim(),
    vlt_percent: decimalToNumber(film.vlt_percent),
    price_per_sqft: decimalToNumber(film.price_per_sqft),
    min_price_per_sqft: decimalToNumber(film.min_price_per_sqft),
    max_price_per_sqft: decimalToNumber(film.max_price_per_sqft),
    roll_widths_in: numberArray(film.roll_widths_in),
    cutting_margin_in: decimalToNumber(film.cutting_margin_in),
    stock_sqft: null,
    stock_low_sqft: null,
  }));

  const cashierAddons: CashierAddon[] = [];
  const removalAddonIds: Partial<Record<CashierDirectionCode, string>> = {};
  for (const addon of addons) {
    const service = serviceById.get(addon.service_type_id);
    const direction = CASHIER_DIRECTIONS.find((item) => item.code === service?.service_code);
    if (!direction) continue;
    if (addon.addon_code === "REMOVAL") removalAddonIds[direction.code] = addon.service_addon_id;
    cashierAddons.push({
      service_addon_id: addon.service_addon_id,
      direction_code: direction.code,
      addon_code: addon.addon_code,
      name_ru: addon.name_ru,
      unit_type: addon.unit_type,
      default_price: decimalToNumber(addon.default_price) ?? 0,
      min_price: decimalToNumber(addon.min_price) ?? 0,
      color_token: addon.color_token ?? null,
      suggested_with_addon_codes: stringArray(addon.suggested_with_addon_codes),
    });
  }

  const cashierAccess: AccessLevel[] = accessLevels.map((level) => ({
    access_code: level.access_code,
    name_ru: level.name_ru,
    labor_coefficient: decimalToNumber(level.labor_coefficient) ?? 1,
    equipment_day_cost: decimalToNumber(level.equipment_day_cost) ?? 0,
    is_contractor: level.is_contractor,
  }));

  const removalService = serviceByCode.get("REMOVAL");
  const catalog: CashierCatalog = {
    films: cashierFilms,
    addons: cashierAddons,
    access_levels: cashierAccess.length ? cashierAccess : undefined,
    installation_cost_per_sqft: installation,
    removal_rate_per_sqft: decimalToNumber(removalService?.base_price) ?? 2.5,
    removal_min_rate_per_sqft: decimalToNumber(removalService?.min_price) ?? undefined,
  };

  const directions = CASHIER_DIRECTIONS.filter((direction) => serviceTypeIds[direction.code]).map((direction) => {
    const directionFilms = cashierFilms.filter((film) => film.category_code === direction.film_category);
    const typeCounts = new Map<string, number>();
    for (const film of directionFilms) {
      if (!film.film_type_code) continue;
      typeCounts.set(film.film_type_code, (typeCounts.get(film.film_type_code) ?? 0) + 1);
    }
    const brands = new Map<string, string>();
    for (const film of films) {
      if (film.category_code === direction.film_category && film.film_class === "premium") brands.set(film.brand_code, film.brand_name_ru);
    }
    return {
      code: direction.code,
      label_ru: direction.label_ru,
      color_token: direction.color_token,
      service_type_id: serviceTypeIds[direction.code]!,
      film_types: [...typeCounts.entries()].map(([code, count]) => ({ code, count })),
      brands: [...brands.entries()].map(([code, name_ru]) => ({ code, name_ru })),
    };
  });

  return { catalog, directions, service_type_ids: serviceTypeIds, removal_addon_ids: removalAddonIds };
}

export type CreateCashierProjectInput = CashierInput & {
  client_id?: string | null;
  client_name?: string | null;
  phone?: string | null;
  email?: string | null;
  city_id?: string | null;
  service_address?: string | null;
  zip_code?: string | null;
  project_title?: string | null;
  site_type?: "RESIDENTIAL" | "COMMERCIAL" | null;
  manager_notes?: string | null;
  /** Замерщик, если размеры снимет он; тогда создаётся консультация со статусом scheduled. */
  consultant_user_id?: string | null;
  installer_id?: string | null;
};

export type CreateCashierProjectResult =
  | { ok: true; project_id: string; project_code: string | null; title: string; quote: CashierQuote }
  | { ok: false; reason: "invalid_payload" | "missing_status_config" | "below_minimum" | "invalid_client" | "invalid_consultant" | "invalid_installer"; quote?: CashierQuote };

/** Считает чек по справочникам и создаёт проект со всеми строками. */
export async function createCashierProject(session: Session, input: CreateCashierProjectInput): Promise<CreateCashierProjectResult> {
  const bundle = await loadCashierCatalog();
  const quote = buildCashierQuote(input, bundle.catalog);

  if (input.directions.length === 0) return { ok: false, reason: "invalid_payload", quote };
  if (quote.errors.some((error) => error.startsWith("below_minimum"))) return { ok: false, reason: "below_minimum", quote };
  const clientName = input.client_name?.trim() || "";
  if (!input.client_id && !clientName) return { ok: false, reason: "invalid_payload", quote };

  const [projectStatus, positionStatus, explicitClient, consultant, installer] = await Promise.all([
    prisma.projectStatus.findUnique({ where: { status_code: "NEW" }, select: { project_status_id: true } }),
    prisma.positionStatus.findUnique({ where: { status_code: "READY" }, select: { position_status_id: true } }),
    input.client_id
      ? prisma.client.findFirst({ where: { client_id: input.client_id, ...buildClientReuseWhere(getRecordManagerScope(session)) }, select: { client_id: true, name: true } })
      : Promise.resolve(null),
    input.consultant_user_id
      ? prisma.user.findFirst({ where: { user_id: input.consultant_user_id, is_active: true }, select: { user_id: true } })
      : Promise.resolve(null),
    input.installer_id
      ? prisma.user.findFirst({
          where: { user_id: input.installer_id, is_active: true, user_accesses: { some: { is_active: true, role: { code: ROLE_CODES.INSTALLER, is_active: true } } } },
          select: { user_id: true },
        })
      : Promise.resolve(null),
  ]);
  if (!projectStatus || !positionStatus) return { ok: false, reason: "missing_status_config", quote };
  if (input.client_id && !explicitClient) return { ok: false, reason: "invalid_client", quote };
  if (input.consultant_user_id && !consultant) return { ok: false, reason: "invalid_consultant", quote };
  if (input.installer_id && !installer) return { ok: false, reason: "invalid_installer", quote };

  const measurerDecides = input.directions.some((direction) => direction.measurer_decides);
  const normalizedEmail = normalizeClientEmail(input.email) || null;
  const normalizedPhone = input.phone?.trim() || null;
  const address = input.service_address?.trim() || null;
  const primaryGroup = quote.groups[0];
  const title = input.project_title?.trim() || `${explicitClient?.name ?? clientName} · ${quote.groups.filter((g) => g.direction_code !== "SITE").map((g) => g.label_ru).join(" + ")}`;

  const project = await prisma.$transaction(async (tx) => {
    const contact = { email: normalizedEmail, phone: normalizedPhone };
    await lockClientIdentity(tx, contact);
    const reusable = explicitClient ? null : await findExistingClientByIdentity(tx, contact);
    if (reusable) {
      const managerId = getRecordManagerScope(session);
      if (managerId) {
        const ids = reusable.matches.map((client) => client.client_id);
        const visible = await tx.client.count({ where: { ...buildClientReuseWhere(managerId), client_id: { in: ids } } });
        if (visible < ids.length) throw new ClientNotAccessibleError();
      }
      if (reusable.conflictingClient) {
        throw new ClientIdentityConflictError(reusable.client.client_id, reusable.conflictingClient.client_id, reusable.matches.map((client) => client.client_id));
      }
    }
    const clientId = explicitClient
      ? explicitClient.client_id
      : reusable
        ? reusable.client.client_id
        : (
            await tx.client.create({
              data: { name: clientName, phone: normalizedPhone, email: normalizedEmail, service_address: address, city_id: input.city_id ?? null, zip_code: input.zip_code?.trim() || null },
              select: { client_id: true },
            })
          ).client_id;

    const created = await tx.project.create({
      data: {
        project_code: `PRJ-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`,
        client_id: clientId,
        manager_id: session.user.user_id,
        lead_installer_id: installer?.user_id ?? null,
        project_status_id: projectStatus.project_status_id,
        city_id: input.city_id ?? null,
        site_type: input.site_type ?? null,
        lead_intent_service_type_id: bundle.service_type_ids[primaryGroup?.direction_code as CashierDirectionCode] ?? null,
        title,
        address,
        zip_code: input.zip_code?.trim() || null,
        priority: "normal",
        manager_notes: input.manager_notes?.trim() || null,
      },
      select: { project_id: true, project_code: true, title: true },
    });

    // Позиции: одна на направление, цена за sq ft в коридоре модели.
    const positionIdByDirection = new Map<CashierDirectionCode, string>();
    let sortOrder = 1;
    for (const group of quote.groups) {
      if (group.direction_code === "SITE") continue;
      const direction = group.direction_code;
      const serviceTypeId = bundle.service_type_ids[direction];
      if (!serviceTypeId) continue;
      const filmLine = group.lines.find((line) => line.kind === "film");
      const accessLines = group.lines.filter((line) => line.kind === "access");
      const position = await tx.projectPosition.create({
        data: {
          project_id: created.project_id,
          service_type_id: serviceTypeId,
          film_id: group.film?.film_id ?? null,
          position_status_id: positionStatus.position_status_id,
          title: filmLine?.title_ru ?? group.label_ru,
          pricing_source: "cashier",
          base_price: filmLine?.unit_price ?? 0,
          min_price: filmLine?.min_unit_price ?? 0,
          actual_price: filmLine?.unit_price ?? 0,
          dynamic_fields: {
            sqft: group.glass_sqft,
            actual_film_sqft: group.cutting ? Number((group.cutting.summary.materialConsumptionSqft).toFixed(2)) : group.glass_sqft,
            perimeter_lft: group.perimeter_lft,
            openings_count: group.openings_count,
            client_unit_price: filmLine?.unit_price ?? 0,
            manual_entry: true,
            measurer_decides: group.measurer_decides,
            access_surcharge: Number(accessLines.reduce((sum, line) => sum + line.amount, 0).toFixed(2)),
            cashier_v1: {
              direction_code: direction,
              is_primary: group.is_primary,
              lines: group.lines.map((line) => ({ kind: line.kind, code: line.code, title_ru: line.title_ru, detail_ru: line.detail_ru, quantity: line.quantity, unit: line.unit, unit_price: line.unit_price, amount: line.amount })),
              cutting: group.cutting
                ? { roll_widths_in: group.cutting.rollWidthsIn, strategy: group.cutting.strategy, summary: group.cutting.summary, unfit: group.cutting.summary.unfitCount }
                : null,
            },
          } satisfies Prisma.InputJsonValue,
          sort_order: sortOrder,
        },
        select: { position_id: true },
      });
      sortOrder += 1;
      positionIdByDirection.set(direction, position.position_id);

      // Допы направления.
      const directionInput = input.directions.find((item) => item.direction_code === direction);
      for (const line of group.lines.filter((item) => item.kind === "addon")) {
        const addon = bundle.catalog.addons.find((item) => item.direction_code === direction && item.addon_code === line.code);
        if (!addon) continue;
        await tx.projectPositionAddon.create({
          data: { position_id: position.position_id, service_addon_id: addon.service_addon_id, quantity: line.quantity, unit_price: line.unit_price, total_price: line.amount },
        });
      }
      void directionInput;
    }

    // Общее по объекту: удаление — допом REMOVAL основного направления, остальное — в снимке.
    const siteGroup = quote.groups.find((group) => group.direction_code === "SITE");
    const primaryDirection = primaryGroup?.direction_code as CashierDirectionCode | undefined;
    const primaryPositionId = primaryDirection ? positionIdByDirection.get(primaryDirection) : undefined;
    if (siteGroup && primaryDirection && primaryPositionId) {
      const removal = siteGroup.lines.find((line) => line.kind === "removal");
      const removalAddonId = bundle.removal_addon_ids[primaryDirection];
      if (removal && removalAddonId) {
        await tx.projectPositionAddon.create({
          data: { position_id: primaryPositionId, service_addon_id: removalAddonId, quantity: removal.quantity, unit_price: removal.unit_price, total_price: removal.amount, notes: removal.detail_ru },
        });
      }
      const extra = siteGroup.lines.filter((line) => line.kind !== "removal");
      if (extra.length) {
        const current = await tx.projectPosition.findUnique({ where: { position_id: primaryPositionId }, select: { dynamic_fields: true } });
        const fields = (current?.dynamic_fields && typeof current.dynamic_fields === "object" && !Array.isArray(current.dynamic_fields) ? current.dynamic_fields : {}) as Record<string, unknown>;
        await tx.projectPosition.update({
          where: { position_id: primaryPositionId },
          data: {
            dynamic_fields: {
              ...fields,
              extra_costs: Number(extra.reduce((sum, line) => sum + line.amount, 0).toFixed(2)),
              site_lines: extra.map((line) => ({ kind: line.kind, code: line.code, title_ru: line.title_ru, detail_ru: line.detail_ru, amount: line.amount })),
            } as Prisma.InputJsonValue,
          },
        });
      }
    }

    // Консультация + замер: окна из кассы ложатся в Measurement, чтобы модуль
    // замера, КП и наряд читали один источник. Если размеры снимет замерщик —
    // консультация запланирована на него, замер пустой.
    const consultantId = consultant?.user_id ?? session.user.user_id;
    const now = new Date();
    const consultation = await tx.consultation.create({
      data: {
        client_id: clientId,
        project_id: created.project_id,
        assigned_consultant_id: consultantId,
        assigned_manager_id: session.user.user_id,
        created_by: session.user.user_id,
        title: measurerDecides ? `Замер · ${title}` : `Размеры от клиента · ${title}`,
        location_address: address,
        scheduled_start_at: now,
        scheduled_end_at: new Date(now.getTime() + 60 * 60 * 1000),
        status: measurerDecides ? "scheduled" : "completed",
        completed_at: measurerDecides ? null : now,
      },
      select: { consultation_id: true },
    });
    const survey = await tx.survey.create({
      data: {
        consultation_id: consultation.consultation_id,
        status: measurerDecides ? "draft" : "completed",
        completed_at: measurerDecides ? null : now,
        solar_recommended: positionIdByDirection.has("SOLAR_FILM"),
        safety_recommended: positionIdByDirection.has("SAFETY_FILM"),
        smart_recommended: positionIdByDirection.has("SMART_FILM"),
      },
      select: { survey_id: true },
    });
    let measurementOrder = 0;
    for (const opening of input.openings) {
      const directionsForOpening = opening.direction_codes.filter((code) => positionIdByDirection.has(code));
      const targets = directionsForOpening.length ? directionsForOpening : [null];
      for (const direction of targets) {
        measurementOrder += 1;
        const sqft = Number(((opening.width_in * opening.height_in * opening.quantity) / 144).toFixed(2));
        await tx.measurement.create({
          data: {
            survey_id: survey.survey_id,
            project_position_id: direction ? positionIdByDirection.get(direction) ?? null : null,
            recorded_by_user_id: session.user.user_id,
            room_name: opening.room_name?.trim() || "Объект",
            window_id: opening.key,
            width: opening.width_in,
            height: opening.height_in,
            sqft,
            quantity: opening.quantity,
            orientation: null,
            access_type: opening.access_code ?? null,
            access_code: opening.access_code ?? null,
            sash_layout_code: opening.sash_layout_code ?? null,
            sash_cols: opening.sash_cols ?? null,
            sash_rows: opening.sash_rows ?? null,
            removal_required: Boolean(opening.removal_required),
            film_id: opening.film_override_id ?? null,
            measurement_source: measurerDecides ? "SURVEYOR_VERIFIED" : "CUSTOMER",
            verification_status: measurerDecides ? "UNVERIFIED" : "UNVERIFIED",
            sort_order: measurementOrder,
            drawing_data: { cashier_v1: { opening_type: opening.opening_type ?? null, direction_codes: directionsForOpening } } as Prisma.InputJsonValue,
          },
        });
      }
    }

    if (installer && primaryPositionId) {
      await tx.installerJob.create({
        data: { project_id: created.project_id, project_position_id: primaryPositionId, installer_id: installer.user_id, status: "assigned" },
      });
      await tx.notification.create({
        data: {
          recipient_user_id: installer.user_id,
          actor_user_id: session.user.user_id,
          entity_type: "project",
          entity_id: created.project_id,
          type_key: "project.manual_assigned",
          title: "Назначен проект",
          message: `Вам назначен проект ${created.title}.`,
        },
      });
    }

    await tx.activityLog.create({
      data: {
        actor_user_id: session.user.user_id,
        entity_type: "project",
        entity_id: created.project_id,
        project_id: created.project_id,
        action_key: "project.created_cashier",
        message: `Проект ${created.title} собран на кассе: ${quote.groups.filter((g) => g.direction_code !== "SITE").map((g) => g.label_ru).join(", ")}; итого $${quote.total}, минимум $${quote.min_total}.`,
        metadata: {
          directions: quote.groups.filter((g) => g.direction_code !== "SITE").map((g) => g.direction_code),
          total: quote.total,
          min_total: quote.min_total,
          glass_sqft: quote.glass_sqft,
          film_sqft: quote.film_sqft,
          openings_count: quote.openings_count,
          measurer_decides: measurerDecides,
          warnings: quote.warnings,
        },
      },
    });

    return created;
  });

  return { ok: true, project_id: project.project_id, project_code: project.project_code, title: project.title, quote };
}
