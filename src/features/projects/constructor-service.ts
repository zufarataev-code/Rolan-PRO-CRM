import { Prisma } from "@prisma/client";

import {
  calculatePaneSqft,
  calculateRemovalSqft,
  evaluateSolarCompatibility,
  parseMeasurementConstructorData,
  resolveEffectiveFilm,
  roomTemplatesForSite,
  verificationStatusForSource,
  withMeasurementConstructorData,
  type MeasurementConstructorDataV1,
} from "@/features/projects/constructor";
import type {
  OpeningMeasurementInput,
  ProjectConstructorPatchInput,
} from "@/features/projects/constructor-request";
import { ROLE_CODES } from "@/lib/auth/constants";
import { prisma } from "@/lib/db";

type ProjectConstructorSession = {
  user: { user_id: string };
  roles: string[];
};

function projectAccessWhere(session: ProjectConstructorSession) {
  if (session.roles.includes(ROLE_CODES.OWNER)) return {};
  if (session.roles.includes(ROLE_CODES.MANAGER)) return { manager_id: session.user.user_id };
  return { consultations: { some: { assigned_consultant_id: session.user.user_id } } };
}

function decimalToNumber(value: { toString(): string } | null | undefined) {
  return value == null ? null : Number(value.toString());
}

function expectedFilmCategory(serviceCode: string) {
  if (serviceCode === "SOLAR_FILM") return "SOLAR";
  if (serviceCode === "SAFETY_FILM") return "SAFETY";
  if (serviceCode === "SMART_FILM") return "SMART";
  return null;
}

const filmSelect = {
  film_id: true,
  category_code: true,
  category_name_ru: true,
  brand_name_ru: true,
  model_name_ru: true,
  model_code: true,
  technology_code: true,
  appearance_code: true,
  application_side: true,
  capability_tags: true,
  allowed_glass_types: true,
  restricted_orientations: true,
  requires_review: true,
  selection_note_ru: true,
} satisfies Prisma.FilmCatalogSelect;

export async function listProjectConstructorSummariesForSession(session: ProjectConstructorSession) {
  return prisma.project.findMany({
    where: projectAccessWhere(session),
    select: {
      project_id: true,
      project_code: true,
      title: true,
      site_type: true,
      address: true,
      project_status: { select: { status_code: true, name_ru: true, color_token: true } },
      client: { select: { client_id: true, name: true, customer_type: true } },
      project_positions: {
        orderBy: { sort_order: "asc" },
        select: { position_id: true, service_type: { select: { service_code: true, name_ru: true } } },
      },
    },
    orderBy: { updated_at: "desc" },
  }).then((projects) => projects.map((project) => ({
    ...project,
    service_summary: project.project_positions.map((position) => position.service_type.name_ru).join(" / "),
    positions_count: project.project_positions.length,
  })));
}

export async function getProjectConstructorForSession(
  session: ProjectConstructorSession,
  projectId: string,
) {
  const project = await prisma.project.findFirst({
    where: { project_id: projectId, ...projectAccessWhere(session) },
    select: {
      project_id: true,
      project_code: true,
      title: true,
      site_type: true,
      client: {
        select: {
          client_id: true,
          name: true,
          customer_type: true,
        },
      },
      project_positions: {
        orderBy: { sort_order: "asc" },
        select: {
          position_id: true,
          title: true,
          sort_order: true,
          film_id: true,
          service_type: {
            select: {
              service_type_id: true,
              service_code: true,
              name_ru: true,
              name_en: true,
            },
          },
          film: { select: filmSelect },
        },
      },
    },
  });

  if (!project) return null;

  const [measurements, serviceTypes, films] = await Promise.all([
    prisma.measurement.findMany({
      where: {
        survey: { consultation: { project_id: projectId } },
        project_position_id: { in: project.project_positions.map((position) => position.position_id) },
      },
      include: {
        recorded_by_user: { select: { user_id: true, full_name: true } },
      },
      orderBy: [{ created_at: "asc" }, { sort_order: "asc" }],
    }),
    prisma.serviceType.findMany({
      where: { is_active: true },
      select: { service_type_id: true, service_code: true, name_ru: true, name_en: true, unit_type: true },
      orderBy: { sort_order: "asc" },
    }),
    prisma.filmCatalog.findMany({
      where: { is_active: true },
      select: filmSelect,
      orderBy: { sort_order: "asc" },
    }),
  ]);

  const filmById = new Map(films.map((film) => [film.film_id, film]));
  const positionById = new Map(project.project_positions.map((position) => [position.position_id, position]));
  const supersededIds = new Set(
    measurements.map((measurement) => measurement.supersedes_measurement_id).filter((id): id is string => Boolean(id)),
  );
  const roomMap = new Map<string, {
    room_key: string;
    project_position_id: string;
    room_name: string;
    room_number: string | null;
    film_id: string | null;
    openings: Map<string, {
      opening_id: string;
      opening_type: string;
      overall_width: number | null;
      overall_height: number | null;
      film_id: string | null;
      orientation: string | null;
      glass: MeasurementConstructorDataV1["glass"];
      cells: Array<Record<string, unknown>>;
    }>;
  }>();

  for (const measurement of measurements) {
    if (supersededIds.has(measurement.measurement_id)) continue;
    const metadata = parseMeasurementConstructorData(measurement.drawing_data);
    if (!metadata?.opening_id || !metadata.cell_id || !measurement.project_position_id) continue;
    const position = positionById.get(measurement.project_position_id);
    if (!position) continue;

    const roomKey = metadata.room_key || measurement.room_name;
    const scopedRoomKey = `${measurement.project_position_id}:${roomKey}`;
    const room = roomMap.get(scopedRoomKey) ?? {
      room_key: roomKey,
      project_position_id: measurement.project_position_id,
      room_name: measurement.room_name,
      room_number: metadata.room_number,
      film_id: metadata.room_film_id,
      openings: new Map(),
    };
    const opening = room.openings.get(metadata.opening_id) ?? {
      opening_id: metadata.opening_id,
      opening_type: metadata.opening_type,
      overall_width: metadata.overall_width,
      overall_height: metadata.overall_height,
      film_id: metadata.opening_film_id,
      orientation: measurement.orientation,
      glass: metadata.glass,
      cells: [],
    };
    const effective = resolveEffectiveFilm({
      project_film_id: position.film_id,
      room_film_id: metadata.room_film_id,
      opening_film_id: metadata.opening_film_id,
      pane_film_id: metadata.film_override_id,
    });
    const effectiveFilm = effective.film_id ? filmById.get(effective.film_id) : null;
    const sqft = calculatePaneSqft({
      width: decimalToNumber(measurement.width),
      height: decimalToNumber(measurement.height),
      quantity: decimalToNumber(measurement.quantity),
    });
    const compatibility = effectiveFilm
      ? evaluateSolarCompatibility({
          allowed_glass_types: effectiveFilm.allowed_glass_types,
          restricted_orientations: effectiveFilm.restricted_orientations,
          requires_review: effectiveFilm.requires_review,
          selection_note_ru: effectiveFilm.selection_note_ru,
          orientation: measurement.orientation,
          opening_type: metadata.opening_type,
          glass: metadata.glass,
        })
      : { status: "REVIEW" as const, reason_codes: ["film_not_selected"], note_ru: null };

    opening.cells.push({
      measurement_id: measurement.measurement_id,
      cell_id: metadata.cell_id,
      width: decimalToNumber(measurement.width),
      height: decimalToNumber(measurement.height),
      quantity: decimalToNumber(measurement.quantity) ?? 1,
      sqft,
      removal_required: metadata.removal_required,
      source: metadata.source,
      verification_status: metadata.verification_status,
      film_override_id: metadata.film_override_id,
      effective_film_id: effective.film_id,
      effective_film_source: effective.source,
      compatibility,
      recorded_at: measurement.created_at,
      recorded_by: measurement.recorded_by_user,
    });
    room.openings.set(metadata.opening_id, opening);
    roomMap.set(scopedRoomKey, room);
  }

  const rooms = [...roomMap.values()].map((room) => ({
    ...room,
    openings: [...room.openings.values()].map((opening) => {
      const totalSqft = opening.cells.reduce((sum, cell) => sum + Number(cell.sqft ?? 0), 0);
      const removalSqft = opening.cells.reduce(
        (sum, cell) => sum + (cell.removal_required ? Number(cell.sqft ?? 0) : 0),
        0,
      );
      return {
        ...opening,
        total_sqft: Number(totalSqft.toFixed(2)),
        removal_sqft: Number(removalSqft.toFixed(2)),
      };
    }),
  }));
  const activeCells = rooms.flatMap((room) => room.openings.flatMap((opening) => opening.cells));

  return {
    project_id: project.project_id,
    project_code: project.project_code,
    title: project.title,
    site_type: project.site_type,
    customer: project.client,
    positions: project.project_positions,
    service_types: serviceTypes,
    films,
    room_templates: project.site_type === "RESIDENTIAL" || project.site_type === "COMMERCIAL"
      ? roomTemplatesForSite(project.site_type)
      : [],
    rooms,
    totals: {
      cells_count: activeCells.length,
      sqft: Number(activeCells.reduce((sum, cell) => sum + Number(cell.sqft ?? 0), 0).toFixed(2)),
      removal_sqft: Number(
        activeCells.reduce((sum, cell) => sum + (cell.removal_required ? Number(cell.sqft ?? 0) : 0), 0).toFixed(2),
      ),
      removal_cells_count: activeCells.filter((cell) => cell.removal_required).length,
      unverified_cells_count: activeCells.filter((cell) => cell.verification_status === "UNVERIFIED").length,
    },
    measurement_history: measurements.map((measurement) => ({
      measurement_id: measurement.measurement_id,
      project_position_id: measurement.project_position_id,
      supersedes_measurement_id: measurement.supersedes_measurement_id,
      superseded: supersededIds.has(measurement.measurement_id),
      source: measurement.measurement_source,
      verification_status: measurement.verification_status,
      constructor: parseMeasurementConstructorData(measurement.drawing_data),
      width: decimalToNumber(measurement.width),
      height: decimalToNumber(measurement.height),
      quantity: decimalToNumber(measurement.quantity) ?? 1,
      created_at: measurement.created_at,
      recorded_by: measurement.recorded_by_user,
    })),
  };
}

export async function updateProjectConstructorForSession(
  session: ProjectConstructorSession,
  projectId: string,
  input: ProjectConstructorPatchInput,
) {
  if (!session.roles.includes(ROLE_CODES.OWNER) && !session.roles.includes(ROLE_CODES.MANAGER)) {
    return "forbidden_change" as const;
  }
  const project = await prisma.project.findFirst({
    where: { project_id: projectId, ...projectAccessWhere(session) },
    select: {
      project_id: true,
      client_id: true,
      project_positions: {
        select: {
          position_id: true,
          service_type_id: true,
          sort_order: true,
          service_type: { select: { service_code: true } },
        },
      },
    },
  });
  if (!project) return null;

  const positionIds = new Set(project.project_positions.map((position) => position.position_id));
  if (input.position_updates.some((update) => !positionIds.has(update.position_id))) {
    return "invalid_position" as const;
  }

  const requestedFilmIds = input.position_updates
    .map((update) => update.film_id)
    .filter((filmId): filmId is string => Boolean(filmId));
  const [films, serviceType, readyStatus] = await Promise.all([
    requestedFilmIds.length
      ? prisma.filmCatalog.findMany({
          where: { film_id: { in: requestedFilmIds }, is_active: true },
          select: { film_id: true, category_code: true },
        })
      : Promise.resolve([]),
    input.add_service_type_id
      ? prisma.serviceType.findFirst({
          where: { service_type_id: input.add_service_type_id, is_active: true },
          select: {
            service_type_id: true,
            name_ru: true,
            base_price: true,
            min_price: true,
          },
        })
      : Promise.resolve(null),
    input.add_service_type_id
      ? prisma.positionStatus.findUnique({ where: { status_code: "READY" }, select: { position_status_id: true } })
      : Promise.resolve(null),
  ]);
  if (new Set(films.map((film) => film.film_id)).size !== new Set(requestedFilmIds).size) {
    return "invalid_film" as const;
  }
  const filmById = new Map(films.map((film) => [film.film_id, film]));
  const projectPositionById = new Map(project.project_positions.map((position) => [position.position_id, position]));
  for (const update of input.position_updates) {
    if (!update.film_id) continue;
    const expectedCategory = expectedFilmCategory(projectPositionById.get(update.position_id)?.service_type.service_code || "");
    if (expectedCategory && filmById.get(update.film_id)?.category_code !== expectedCategory) {
      return "incompatible_film_category" as const;
    }
  }
  if (input.add_service_type_id && !serviceType) return "invalid_service" as const;
  if (input.add_service_type_id && !readyStatus) return "missing_status_config" as const;
  if (input.add_service_type_id
    && project.project_positions.some((position) => position.service_type_id === input.add_service_type_id)) {
    return "duplicate_service" as const;
  }

  await prisma.$transaction(async (tx) => {
    if (input.site_type) {
      await tx.project.update({ where: { project_id: projectId }, data: { site_type: input.site_type } });
    }
    if (input.customer_type) {
      await tx.client.update({ where: { client_id: project.client_id }, data: { customer_type: input.customer_type } });
    }
    for (const update of input.position_updates) {
      await tx.projectPosition.update({ where: { position_id: update.position_id }, data: { film_id: update.film_id } });
    }
    if (serviceType && readyStatus) {
      const nextSortOrder = project.project_positions.reduce((max, position) => Math.max(max, position.sort_order), 0) + 1;
      await tx.projectPosition.create({
        data: {
          project_id: projectId,
          service_type_id: serviceType.service_type_id,
          position_status_id: readyStatus.position_status_id,
          title: serviceType.name_ru,
          base_price: serviceType.base_price,
          min_price: serviceType.min_price,
          actual_price: serviceType.base_price,
          pricing_source: "catalog",
          sort_order: nextSortOrder,
        },
      });
    }
    await tx.activityLog.create({
      data: {
        actor_user_id: session.user.user_id,
        entity_type: "project",
        entity_id: projectId,
        project_id: projectId,
        action_key: "project.constructor.updated",
        message: "Обновлены параметры конструктора проекта.",
        metadata: {
          site_type: input.site_type ?? null,
          customer_type: input.customer_type ?? null,
          added_service_type_id: input.add_service_type_id ?? null,
          updated_positions: input.position_updates.map((update) => update.position_id),
        },
      },
    });
  });

  return getProjectConstructorForSession(session, projectId);
}

export async function addProjectOpeningMeasurement(
  session: ProjectConstructorSession,
  projectId: string,
  input: OpeningMeasurementInput,
) {
  const consultantOnly = session.roles.includes(ROLE_CODES.CONSULTANT)
    && !session.roles.includes(ROLE_CODES.OWNER)
    && !session.roles.includes(ROLE_CODES.MANAGER);
  if (consultantOnly && input.source !== "SURVEYOR_VERIFIED") {
    return "verified_source_required" as const;
  }
  const project = await prisma.project.findFirst({
    where: { project_id: projectId, ...projectAccessWhere(session) },
    select: {
      project_id: true,
      site_type: true,
      project_positions: {
        where: { position_id: input.project_position_id },
        select: { position_id: true, film_id: true, service_type: { select: { service_code: true } } },
      },
      consultations: {
        where: { survey: { isNot: null } },
        orderBy: { created_at: "desc" },
        take: 1,
        select: { survey: { select: { survey_id: true } } },
      },
    },
  });
  if (!project) return null;
  const position = project.project_positions[0];
  if (!position) return "invalid_position" as const;
  if (position.service_type.service_code !== "SOLAR_FILM") return "unsupported_service" as const;
  if (project.site_type && project.site_type !== input.site_type) return "site_type_mismatch" as const;
  const surveyId = project.consultations[0]?.survey?.survey_id;
  if (!surveyId) return "survey_required" as const;

  const requestedFilmIds = new Set(
    [input.room_film_id, input.opening_film_id, ...input.cells.map((cell) => cell.film_override_id)]
      .filter((filmId): filmId is string => Boolean(filmId)),
  );
  if (requestedFilmIds.size > 0) {
    const activeFilms = await prisma.filmCatalog.count({
      where: { film_id: { in: [...requestedFilmIds] }, category_code: "SOLAR", is_active: true },
    });
    if (activeFilms !== requestedFilmIds.size) return "invalid_film" as const;
  }

  const supersedesIds = input.cells
    .map((cell) => cell.supersedes_measurement_id)
    .filter((id): id is string => Boolean(id));
  if (supersedesIds.length > 0) {
    const alreadyRevised = await prisma.measurement.count({
      where: { supersedes_measurement_id: { in: supersedesIds } },
    });
    if (alreadyRevised > 0) return "stale_revision" as const;
    const existing = await prisma.measurement.findMany({
      where: {
        measurement_id: { in: supersedesIds },
        survey_id: surveyId,
        project_position_id: input.project_position_id,
      },
      select: { measurement_id: true, measurement_source: true, drawing_data: true },
    });
    if (existing.length !== new Set(supersedesIds).size) return "invalid_revision" as const;
    for (const prior of existing) {
      const metadata = parseMeasurementConstructorData(prior.drawing_data);
      const cell = input.cells.find((candidate) => candidate.supersedes_measurement_id === prior.measurement_id);
      if (!metadata || !cell || metadata.opening_id !== input.opening_id || metadata.cell_id !== cell.cell_id) {
        return "invalid_revision" as const;
      }
      if (input.source === "CUSTOMER" && prior.measurement_source === "SURVEYOR_VERIFIED") {
        return "verified_revision_required" as const;
      }
    }
  }

  const existingOpeningCells = await prisma.measurement.findMany({
    where: {
      survey_id: surveyId,
      project_position_id: input.project_position_id,
      window_id: input.opening_id,
      zone_name: { in: input.cells.map((cell) => cell.cell_id) },
    },
    select: { measurement_id: true, zone_name: true },
  });
  if (existingOpeningCells.length > 0) {
    const revisedIds = new Set(
      (await prisma.measurement.findMany({
        where: { supersedes_measurement_id: { in: existingOpeningCells.map((cell) => cell.measurement_id) } },
        select: { supersedes_measurement_id: true },
      }))
        .map((row) => row.supersedes_measurement_id)
        .filter((id): id is string => Boolean(id)),
    );
    const activeByCell = new Map(
      existingOpeningCells
        .filter((cell) => !revisedIds.has(cell.measurement_id) && cell.zone_name)
        .map((cell) => [cell.zone_name as string, cell.measurement_id]),
    );
    for (const cell of input.cells) {
      const activeId = activeByCell.get(cell.cell_id);
      if (activeId && cell.supersedes_measurement_id !== activeId) {
        return "duplicate_opening_cell" as const;
      }
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    if (!project.site_type) {
      await tx.project.update({ where: { project_id: projectId }, data: { site_type: input.site_type } });
    }
    const rows = [];
    for (const [index, cell] of input.cells.entries()) {
      const constructor = {
        site_type: input.site_type,
        source: input.source,
        room_key: input.room_key,
        room_number: input.room_number,
        room_film_id: input.room_film_id,
        opening_id: input.opening_id,
        opening_type: input.opening_type,
        opening_film_id: input.opening_film_id,
        overall_width: input.overall_width,
        overall_height: input.overall_height,
        cell_id: cell.cell_id,
        pane_index: index + 1,
        removal_required: cell.removal_required,
        glass: input.glass,
        film_override_id: cell.film_override_id,
      } as const;
      rows.push(await tx.measurement.create({
        data: {
          survey_id: surveyId,
          project_position_id: input.project_position_id,
          supersedes_measurement_id: cell.supersedes_measurement_id,
          recorded_by_user_id: session.user.user_id,
          room_name: input.room_name,
          zone_name: cell.cell_id,
          window_id: input.opening_id,
          width: cell.width,
          height: cell.height,
          sqft: calculatePaneSqft(cell),
          quantity: cell.quantity,
          glass_type: input.glass.construction,
          orientation: input.orientation,
          measurement_source: input.source,
          verification_status: verificationStatusForSource(input.source),
          drawing_data: withMeasurementConstructorData(null, constructor) as Prisma.InputJsonValue,
          sort_order: index,
        },
        select: { measurement_id: true },
      }));
    }
    await tx.activityLog.create({
      data: {
        actor_user_id: session.user.user_id,
        entity_type: "project",
        entity_id: projectId,
        project_id: projectId,
        action_key: "project.measurement.opening_recorded",
        message: `Сохранён замер ${input.room_name} / ${input.opening_id}.`,
        metadata: {
          project_position_id: input.project_position_id,
          opening_id: input.opening_id,
          source: input.source,
          verification_status: verificationStatusForSource(input.source),
          cell_count: input.cells.length,
          sqft: calculateRemovalSqft(input.cells.map((cell) => ({ ...cell, removal_required: true }))),
          removal_sqft: calculateRemovalSqft(input.cells),
        },
      },
    });
    return rows;
  });

  return { measurement_ids: created.map((row) => row.measurement_id) };
}
