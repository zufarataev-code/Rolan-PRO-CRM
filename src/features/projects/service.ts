import { Prisma } from "@prisma/client";

import { ROLE_CODES } from "@/lib/auth/constants";
import { INSTALLER_JOB_STATUSES } from "@/features/projects/api";
import { PROPOSAL_STATUSES } from "@/features/proposals/api";
import { prisma } from "@/lib/db";
import { omitSensitiveFinancialFields } from "@/lib/finance/visibility";
import { onInstallationAssigned, onJobStarted, onProjectCompleted, onProjectCreated } from "@/features/core/events";
import { recordInstallerPayrollAccrual } from "@/features/installer-operations/service";

const FILM_SERVICE_CODES = new Set(["SMART_FILM", "SOLAR_FILM", "SAFETY_FILM"]);
const ACTIVE_INSTALLER_JOB_STATUSES = new Set<string>([
  INSTALLER_JOB_STATUSES.ASSIGNED,
  INSTALLER_JOB_STATUSES.ON_THE_WAY,
  INSTALLER_JOB_STATUSES.STARTED,
  INSTALLER_JOB_STATUSES.PAUSED,
]);
const INSTALLER_JOB_TRANSITIONS: Record<string, string[]> = {
  [INSTALLER_JOB_STATUSES.ASSIGNED]: [INSTALLER_JOB_STATUSES.ON_THE_WAY],
  [INSTALLER_JOB_STATUSES.ON_THE_WAY]: [INSTALLER_JOB_STATUSES.STARTED],
  [INSTALLER_JOB_STATUSES.STARTED]: [INSTALLER_JOB_STATUSES.PAUSED, INSTALLER_JOB_STATUSES.COMPLETED],
  [INSTALLER_JOB_STATUSES.PAUSED]: [INSTALLER_JOB_STATUSES.STARTED],
  [INSTALLER_JOB_STATUSES.COMPLETED]: [],
};

type DbClient = Prisma.TransactionClient;

type ProjectSession = {
  user: {
    user_id: string;
  };
  roles: string[];
};

type JsonRecord = Record<string, string | number | boolean | null>;

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return Number(value.toString());
}

function asNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function asJsonRecord(value: Prisma.JsonValue | null | undefined): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;

  return Object.fromEntries(
    Object.entries(record).map(([key, entryValue]) => {
      if (
        typeof entryValue === "string" ||
        typeof entryValue === "number" ||
        typeof entryValue === "boolean" ||
        entryValue === null
      ) {
        return [key, entryValue];
      }

      return [key, null];
    }),
  );
}

function isOwner(session: ProjectSession) {
  return session.roles.includes("OWNER");
}

function isUniqueConstraintError(error: unknown, target: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes(target)
  );
}

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function getProjectWhereForSession(session: ProjectSession) {
  if (isOwner(session)) {
    return {};
  }

  return {
    manager_id: session.user.user_id,
  };
}

function formatAddonLabel(addon: {
  service_addon: {
    name_ru: string;
    addon_code: string;
  };
  notes: string | null;
}) {
  if (addon.service_addon.addon_code === "OTHER" && addon.notes?.trim()) {
    return addon.notes.trim();
  }

  return addon.service_addon.name_ru;
}

function buildProjectPositionDynamicFields(item: {
  proposal_item_id: string;
  item_kind: string;
  measurement_id: string | null;
  measurement_snapshot: Prisma.JsonValue | null;
  dynamic_fields: Prisma.JsonValue | null;
  addons_snapshot: Prisma.JsonValue | null;
  line_price: Prisma.Decimal;
}) {
  const measurementSnapshot = asObject(item.measurement_snapshot);
  const dynamicFields = asObject(item.dynamic_fields);
  const addonsSnapshot = Array.isArray(item.addons_snapshot) ? item.addons_snapshot : [];

  return {
    ...measurementSnapshot,
    ...dynamicFields,
    proposal_item_id: item.proposal_item_id,
    item_kind: item.item_kind,
    source_measurement_id: item.measurement_id,
    client_price: toNumber(item.line_price),
    addons_snapshot: addonsSnapshot,
    measurement_snapshot: item.measurement_snapshot ?? null,
  } as Prisma.InputJsonValue;
}

function parseDateOnly(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTimeOnly(value: string | null | undefined) {
  if (!value?.trim()) {
    return null;
  }

  const normalized = value.trim().length === 5 ? `${value.trim()}:00` : value.trim();
  const date = new Date(`1970-01-01T${normalized}.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function createProjectCode() {
  return `PRJ-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;
}

function isOverdueProject(project: { install_date: Date | null; project_status: { status_code: string } }) {
  if (!project.install_date) {
    return false;
  }

  if (project.project_status.status_code === "COMPLETED") {
    return false;
  }

  return project.install_date.getTime() < Date.now();
}

function isRecentlyCreated(value: Date, hours = 24) {
  return Date.now() - value.getTime() <= hours * 60 * 60 * 1000;
}

async function getProjectStatusId(statusCode: string) {
  const status = await prisma.projectStatus.findUnique({
    where: {
      status_code: statusCode,
    },
    select: {
      project_status_id: true,
    },
  });

  return status?.project_status_id ?? null;
}

async function getPositionStatusId(statusCode: string) {
  const status = await prisma.positionStatus.findUnique({
    where: {
      status_code: statusCode,
    },
    select: {
      position_status_id: true,
    },
  });

  return status?.position_status_id ?? null;
}

function buildInstallerJobWhereForSession(session: ProjectSession, installerJobId?: string) {
  if (session.roles.includes(ROLE_CODES.OWNER)) {
    return installerJobId ? { installer_job_id: installerJobId } : {};
  }

  if (session.roles.includes(ROLE_CODES.MANAGER)) {
    return {
      ...(installerJobId ? { installer_job_id: installerJobId } : {}),
      project: {
        manager_id: session.user.user_id,
      },
    };
  }

  return {
    ...(installerJobId ? { installer_job_id: installerJobId } : {}),
    installer_id: session.user.user_id,
  };
}

function serializeScheduleAssignment(assignment: {
  schedule_assignment_id: string;
  date: Date;
  start_time: Date | null;
  end_time: Date | null;
  crew: {
    crew_id: string;
    name: string;
  };
}) {
  return {
    schedule_assignment_id: assignment.schedule_assignment_id,
    date: assignment.date,
    start_time: assignment.start_time,
    end_time: assignment.end_time,
    crew: {
      crew_id: assignment.crew.crew_id,
      name: assignment.crew.name,
    },
  };
}

async function getProjectStubByProposalId(proposalId: string) {
  return prisma.project.findUnique({
    where: {
      proposal_id: proposalId,
    },
    select: {
      project_id: true,
      project_code: true,
      title: true,
    },
  });
}

type InstallerAssignmentInput = {
  project_position_id: string;
  installer_id: string;
};

function validateInstallerAssignments(
  projectPositionIds: string[],
  assignments: InstallerAssignmentInput[],
) {
  if (projectPositionIds.length === 0) {
    return "missing_positions" as const;
  }

  if (assignments.length !== projectPositionIds.length) {
    return "incomplete_assignments" as const;
  }

  const positionIdSet = new Set(projectPositionIds);
  const assignedPositionIds = new Set<string>();

  for (const assignment of assignments) {
    if (!positionIdSet.has(assignment.project_position_id)) {
      return "invalid_position" as const;
    }

    if (assignedPositionIds.has(assignment.project_position_id)) {
      return "duplicate_position_assignment" as const;
    }

    assignedPositionIds.add(assignment.project_position_id);
  }

  if (assignedPositionIds.size !== projectPositionIds.length) {
    return "incomplete_assignments" as const;
  }

  return null;
}

async function upsertProjectScheduleAssignment(
  tx: DbClient,
  input: {
    project_id: string;
    crew_id: string;
    date: Date;
    start_time: Date | null;
    end_time: Date | null;
  },
) {
  return tx.scheduleAssignment.upsert({
    where: {
      project_id: input.project_id,
    },
    update: {
      date: input.date,
      start_time: input.start_time,
      end_time: input.end_time,
      crew_id: input.crew_id,
    },
    create: {
      project_id: input.project_id,
      date: input.date,
      start_time: input.start_time,
      end_time: input.end_time,
      crew_id: input.crew_id,
    },
    include: {
      crew: {
        select: {
          crew_id: true,
          name: true,
        },
      },
    },
  });
}

async function upsertInstallerJobs(
  tx: DbClient,
  input: {
    project_id: string;
    crew_id: string | null;
    schedule_assignment_id: string;
    assignments: InstallerAssignmentInput[];
  },
) {
  const savedJobs = [] as Array<{
    installer_job_id: string;
    status: string;
    installer: {
      user_id: string;
      full_name: string;
    };
    position: {
      position_id: string;
      title: string | null;
    } | null;
    schedule_assignment: {
      schedule_assignment_id: string;
      date: Date;
      start_time: Date | null;
      end_time: Date | null;
      crew: {
        crew_id: string;
        name: string;
      };
    } | null;
  }>;

  for (const assignment of input.assignments) {
    const saved = await tx.installerJob.upsert({
      where: {
        project_position_id: assignment.project_position_id,
      },
      update: {
        project_id: input.project_id,
        installer_id: assignment.installer_id,
        schedule_assignment_id: input.schedule_assignment_id,
        crew_id: input.crew_id,
        status: INSTALLER_JOB_STATUSES.ASSIGNED,
        on_the_way_at: null,
        started_at: null,
        paused_at: null,
        completed_at: null,
      },
      create: {
        project_id: input.project_id,
        project_position_id: assignment.project_position_id,
        installer_id: assignment.installer_id,
        schedule_assignment_id: input.schedule_assignment_id,
        crew_id: input.crew_id,
        status: INSTALLER_JOB_STATUSES.ASSIGNED,
      },
      include: {
        installer: {
          select: {
            user_id: true,
            full_name: true,
          },
        },
        position: {
          select: {
            position_id: true,
            title: true,
          },
        },
        schedule_assignment: {
          include: {
            crew: {
              select: {
                crew_id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    savedJobs.push(saved);
  }

  return savedJobs;
}

export function calculatePositionFinance(
  position: {
    actual_price: Prisma.Decimal;
    min_price: Prisma.Decimal;
    dynamic_fields: Prisma.JsonValue | null;
    service_type: {
      service_code: string;
      unit_type: string;
      material_cost_per_sqft: Prisma.Decimal;
      installation_cost_per_sqft: Prisma.Decimal;
      block_revenue_price: Prisma.Decimal;
      block_cost_price: Prisma.Decimal;
    };
    complexity_level: {
      multiplier: Prisma.Decimal;
      name_ru: string;
    } | null;
    position_addons: Array<{
      quantity: Prisma.Decimal;
      unit_price: Prisma.Decimal;
      total_price: Prisma.Decimal;
      notes: string | null;
      service_addon: {
        addon_code: string;
        name_ru: string;
        min_price: Prisma.Decimal;
        cost_price: Prisma.Decimal;
        unit_type: string;
      };
    }>;
  },
) {
  const dynamic = asJsonRecord(position.dynamic_fields);
  const isFilmService = FILM_SERVICE_CODES.has(position.service_type.service_code);
  const billableSqft = asNumber(dynamic.sqft);
  const actualFilmSqft = asNumber(dynamic.actual_film_sqft) || billableSqft;
  const blocksQty = asNumber(dynamic.blocks_qty);
  const extraCosts = asNumber(dynamic.extra_costs);
  const complexityMultiplier = isFilmService ? toNumber(position.complexity_level?.multiplier) || 1 : 1;
  const serviceUnitPrice = toNumber(position.actual_price);
  const minPrice = toNumber(position.min_price);
  const installationCostPerSqft =
    asNumber(dynamic.manual_installation_cost_per_sqft) || toNumber(position.service_type.installation_cost_per_sqft);
  const blockUnitPrice =
    asNumber(dynamic.block_unit_price) || toNumber(position.service_type.block_revenue_price);

  const filmRevenue = billableSqft * serviceUnitPrice * (isFilmService ? complexityMultiplier : 1);
  const blockRevenue = blocksQty * blockUnitPrice;

  const addonRows = position.position_addons.map((addon) => {
    const quantity = toNumber(addon.quantity);
    const unitPrice = toNumber(addon.unit_price);
    const totalPrice = toNumber(addon.total_price) || quantity * unitPrice;
    const addonCost = quantity * toNumber(addon.service_addon.cost_price);
    const belowMinimum =
      unitPrice > 0 && toNumber(addon.service_addon.min_price) > 0 && unitPrice < toNumber(addon.service_addon.min_price);

    return {
      label: formatAddonLabel(addon),
      unit_type: addon.service_addon.unit_type,
      quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
      estimated_cost: addonCost,
      below_minimum: belowMinimum,
    };
  });

  const addonsRevenue = addonRows.reduce((sum, addon) => sum + addon.total_price, 0);
  const addonCostTotal = addonRows.reduce((sum, addon) => sum + addon.estimated_cost, 0);
  const materialCostTotal = actualFilmSqft * toNumber(position.service_type.material_cost_per_sqft);
  const installationCostTotal =
    actualFilmSqft * installationCostPerSqft * (isFilmService ? complexityMultiplier : 1);
  const blockCostTotal = blocksQty * toNumber(position.service_type.block_cost_price);
  const estimatedCost = materialCostTotal + installationCostTotal + blockCostTotal + addonCostTotal + extraCosts;
  const revenueSubtotal = filmRevenue + blockRevenue + addonsRevenue;
  const estimatedProfit = revenueSubtotal - estimatedCost;
  const estimatedMarginPercent = revenueSubtotal > 0 ? (estimatedProfit / revenueSubtotal) * 100 : 0;

  return {
    revenue_subtotal: Number(revenueSubtotal.toFixed(2)),
    film_revenue: Number(filmRevenue.toFixed(2)),
    block_revenue: Number(blockRevenue.toFixed(2)),
    addons_revenue: Number(addonsRevenue.toFixed(2)),
    material_cost_total: Number(materialCostTotal.toFixed(2)),
    installation_cost_total: Number(installationCostTotal.toFixed(2)),
    block_cost_total: Number(blockCostTotal.toFixed(2)),
    addon_cost_total: Number(addonCostTotal.toFixed(2)),
    extra_costs_total: Number(extraCosts.toFixed(2)),
    estimated_cost: Number(estimatedCost.toFixed(2)),
    estimated_profit: Number(estimatedProfit.toFixed(2)),
    estimated_margin_percent: Number(estimatedMarginPercent.toFixed(2)),
    service_unit_price: Number(serviceUnitPrice.toFixed(2)),
    complexity_multiplier: Number(complexityMultiplier.toFixed(2)),
    billable_sqft: billableSqft,
    actual_film_sqft: actualFilmSqft,
    blocks_qty: blocksQty,
    below_minimum_warning:
      (serviceUnitPrice > 0 && minPrice > 0 && serviceUnitPrice < minPrice) ||
      addonRows.some((addon) => addon.below_minimum),
    warnings: [
      ...(serviceUnitPrice > 0 && minPrice > 0 && serviceUnitPrice < minPrice
        ? [`Цена позиции ниже минимума: $${minPrice.toFixed(2)}`]
        : []),
      ...addonRows
        .filter((addon) => addon.below_minimum)
        .map((addon) => `${addon.label}: цена ниже минимума`),
    ],
    addons: addonRows,
  };
}

export async function createManualProject(
  session: ProjectSession,
  input: {
    client_name: string;
    phone?: string | null;
    email?: string | null;
    city_id?: string | null;
    service_address?: string | null;
    zip_code?: string | null;
    project_title: string;
    service_type_id: string;
    film_id?: string | null;
    billable_sqft: number;
    actual_film_sqft?: number | null;
    client_unit_price?: number | null;
    installation_cost_per_sqft?: number | null;
    extra_costs?: number | null;
    installer_id?: string | null;
    project_notes?: string | null;
    position_notes?: string | null;
  },
) {
  const trimmedClientName = input.client_name.trim();
  const trimmedProjectTitle = input.project_title.trim();
  const normalizedPhone = input.phone?.trim() || null;
  const normalizedEmail = input.email?.trim().toLowerCase() || null;
  const normalizedAddress = input.service_address?.trim() || null;
  const normalizedZip = input.zip_code?.trim() || null;
  const normalizedProjectNotes = input.project_notes?.trim() || null;
  const normalizedPositionNotes = input.position_notes?.trim() || null;

  if (!trimmedClientName || !trimmedProjectTitle || !input.service_type_id || input.billable_sqft <= 0) {
    return "invalid_payload" as const;
  }

  const [projectStatusId, positionStatusId, serviceType, film, city, installer] = await Promise.all([
    getProjectStatusId("NEW"),
    getPositionStatusId("READY"),
    prisma.serviceType.findFirst({
      where: {
        service_type_id: input.service_type_id,
        is_active: true,
      },
      select: {
        service_type_id: true,
        service_code: true,
        name_ru: true,
        base_price: true,
        min_price: true,
        installation_cost_per_sqft: true,
      },
    }),
    input.film_id
      ? prisma.filmCatalog.findFirst({
          where: {
            film_id: input.film_id,
            is_active: true,
          },
          select: {
            film_id: true,
            category_code: true,
            category_name_ru: true,
            brand_name_ru: true,
            model_name_ru: true,
          },
        })
      : Promise.resolve(null),
    input.city_id
      ? prisma.city.findFirst({
          where: {
            city_id: input.city_id,
            is_active: true,
          },
          select: {
            city_id: true,
          },
        })
      : Promise.resolve(null),
    input.installer_id
      ? prisma.user.findFirst({
          where: {
            user_id: input.installer_id,
            is_active: true,
            user_accesses: {
              some: {
                is_active: true,
                role: {
                  code: ROLE_CODES.INSTALLER,
                  is_active: true,
                },
              },
            },
          },
          select: {
            user_id: true,
            full_name: true,
          },
        })
      : Promise.resolve(null),
  ]);

  if (!projectStatusId || !positionStatusId) {
    return "missing_status_config" as const;
  }

  if (!serviceType) {
    return "invalid_service" as const;
  }

  if (!film) {
    return "invalid_film" as const;
  }

  if (input.city_id && !city) {
    return "invalid_city" as const;
  }

  if (input.installer_id && !installer) {
    return "invalid_installer" as const;
  }

  const clientUnitPrice =
    input.client_unit_price && input.client_unit_price > 0
      ? input.client_unit_price
      : toNumber(serviceType.base_price);
  const actualFilmSqft = input.actual_film_sqft && input.actual_film_sqft > 0 ? input.actual_film_sqft : input.billable_sqft;
  const installationCostPerSqft =
    input.installation_cost_per_sqft && input.installation_cost_per_sqft > 0
      ? input.installation_cost_per_sqft
      : toNumber(serviceType.installation_cost_per_sqft);
  const extraCosts = input.extra_costs && input.extra_costs > 0 ? input.extra_costs : 0;
  const positionTitle = `${serviceType.name_ru} · ${film.brand_name_ru} ${film.model_name_ru}`;

  const project = await prisma.$transaction(async (tx) => {
    const reusableClient =
      normalizedEmail || normalizedPhone
        ? await tx.client.findFirst({
            where: {
              OR: [
                ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
                ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
              ],
            },
            select: {
              client_id: true,
            },
          })
        : null;

    const clientRecord = reusableClient
      ? await tx.client.update({
          where: {
            client_id: reusableClient.client_id,
          },
          data: {
            name: trimmedClientName,
            phone: normalizedPhone,
            email: normalizedEmail,
            service_address: normalizedAddress,
            city_id: city?.city_id ?? null,
            zip_code: normalizedZip,
          },
          select: {
            client_id: true,
          },
        })
      : await tx.client.create({
          data: {
            name: trimmedClientName,
            phone: normalizedPhone,
            email: normalizedEmail,
            service_address: normalizedAddress,
            city_id: city?.city_id ?? null,
            zip_code: normalizedZip,
          },
          select: {
            client_id: true,
          },
        });

    const createdProject = await tx.project.create({
      data: {
        project_code: createProjectCode(),
        client_id: clientRecord.client_id,
        manager_id: session.user.user_id,
        lead_installer_id: installer?.user_id ?? null,
        project_status_id: projectStatusId,
        city_id: city?.city_id ?? null,
        title: trimmedProjectTitle,
        address: normalizedAddress,
        zip_code: normalizedZip,
        priority: "normal",
        manager_notes: normalizedProjectNotes,
      },
      select: {
        project_id: true,
        project_code: true,
        title: true,
      },
    });

    const createdPosition = await tx.projectPosition.create({
      data: {
        project_id: createdProject.project_id,
        service_type_id: serviceType.service_type_id,
        film_id: film.film_id,
        position_status_id: positionStatusId,
        title: positionTitle,
        dynamic_fields: {
          sqft: Number(input.billable_sqft.toFixed(2)),
          actual_film_sqft: Number(actualFilmSqft.toFixed(2)),
          extra_costs: Number(extraCosts.toFixed(2)),
          manual_installation_cost_per_sqft: Number(installationCostPerSqft.toFixed(2)),
          client_unit_price: Number(clientUnitPrice.toFixed(2)),
          material_category: film.category_name_ru,
          manual_entry: true,
        } satisfies Prisma.InputJsonValue,
        pricing_source: "manual",
        base_price: clientUnitPrice,
        min_price: serviceType.min_price,
        actual_price: clientUnitPrice,
        notes: normalizedPositionNotes,
        sort_order: 1,
      },
      select: {
        position_id: true,
      },
    });

    if (installer) {
      await tx.installerJob.create({
        data: {
          project_id: createdProject.project_id,
          project_position_id: createdPosition.position_id,
          installer_id: installer.user_id,
          status: INSTALLER_JOB_STATUSES.ASSIGNED,
        },
      });

      await tx.notification.create({
        data: {
          recipient_user_id: installer.user_id,
          actor_user_id: session.user.user_id,
          entity_type: "project",
          entity_id: createdProject.project_id,
          type_key: "project.manual_assigned",
          title: "Назначен проект",
          message: `Вам назначен проект ${createdProject.title}.`,
        },
      });
    }

    await tx.activityLog.create({
      data: {
        actor_user_id: session.user.user_id,
        entity_type: "project",
        entity_id: createdProject.project_id,
        project_id: createdProject.project_id,
        action_key: "project.created_manual",
        message: `Проект ${createdProject.title} создан вручную из quick entry.`,
        metadata: {
          client_name: trimmedClientName,
          service_type_id: serviceType.service_type_id,
          service_code: serviceType.service_code,
          film_id: film.film_id,
          billable_sqft: Number(input.billable_sqft.toFixed(2)),
          actual_film_sqft: Number(actualFilmSqft.toFixed(2)),
          installer_id: installer?.user_id ?? null,
        },
      },
    });

    return createdProject;
  });

  return project;
}

export async function createProjectFromProposal(
  session: ProjectSession,
  input: {
    proposal_id: string;
  },
) {
  const proposal = await prisma.proposal.findFirst({
    where: {
      proposal_id: input.proposal_id,
      ...(isOwner(session)
        ? {}
        : {
            OR: [{ created_by: session.user.user_id }, { deal: { assigned_manager_id: session.user.user_id } }],
          }),
    },
    include: {
      client: true,
      deal: {
        select: {
          deal_id: true,
          assigned_manager_id: true,
          lead_id: true,
        },
      },
      deposit: true,
      project: {
        select: {
          project_id: true,
          project_code: true,
          title: true,
        },
      },
      proposal_items: {
        where: {
          client_selected: true,
        },
        orderBy: {
          sort_order: "asc",
        },
        select: {
          proposal_item_id: true,
          measurement_id: true,
          service_type_id: true,
          film_id: true,
          item_kind: true,
          room_name: true,
          zone_name: true,
          window_id: true,
          title_ru: true,
          description_ru: true,
          measurement_snapshot: true,
          dynamic_fields: true,
          addons_snapshot: true,
          quantity: true,
          unit_label: true,
          line_price: true,
          sort_order: true,
        },
      },
    },
  });

  if (!proposal) {
    return null;
  }

  if (proposal.project) {
    return proposal.project;
  }

  if (proposal.status !== PROPOSAL_STATUSES.APPROVED) {
    return "proposal_not_approved" as const;
  }

  if (!proposal.deposit || proposal.deposit.status !== "paid") {
    return "deposit_not_paid" as const;
  }

  if (proposal.proposal_items.length === 0) {
    return "missing_selection" as const;
  }

  const [projectStatus, paymentStatus, positionStatus] = await Promise.all([
    prisma.projectStatus.findUnique({
      where: {
        status_code: "NEW",
      },
      select: {
        project_status_id: true,
      },
    }),
    prisma.paymentStatus.findUnique({
      where: {
        status_code: "DEPOSIT_PAID",
      },
      select: {
        payment_status_id: true,
      },
    }),
    prisma.positionStatus.findUnique({
      where: {
        status_code: "READY",
      },
      select: {
        position_status_id: true,
      },
    }),
  ]);

  if (!projectStatus?.project_status_id || !paymentStatus?.payment_status_id || !positionStatus?.position_status_id) {
    return "missing_status_config" as const;
  }

  try {
    const createdProject = await prisma.$transaction(async (tx) => {
      const existingProject = await tx.project.findUnique({
        where: {
          proposal_id: proposal.proposal_id,
        },
        select: {
          project_id: true,
          project_code: true,
          title: true,
        },
      });

      if (existingProject) {
        return existingProject;
      }

      const created = await tx.project.create({
        data: {
          project_code: `PRJ-${Date.now().toString().slice(-6)}`,
          client_id: proposal.client_id,
          deal_id: proposal.deal_id,
          proposal_id: proposal.proposal_id,
          manager_id: proposal.deal?.assigned_manager_id ?? session.user.user_id,
          project_status_id: projectStatus.project_status_id,
          payment_status_id: paymentStatus.payment_status_id,
          city_id: proposal.client.city_id ?? null,
          title: proposal.title,
          address: proposal.client.service_address ?? proposal.client.billing_address ?? null,
          zip_code: proposal.client.zip_code ?? null,
          priority: "normal",
        },
        select: {
          project_id: true,
          project_code: true,
          title: true,
        },
      });

      for (const item of proposal.proposal_items) {
        await tx.projectPosition.create({
          data: {
            project_id: created.project_id,
            proposal_item_id: item.proposal_item_id,
            service_type_id: item.service_type_id,
            film_id: item.film_id,
            position_status_id: positionStatus.position_status_id,
            title: item.title_ru,
            dynamic_fields: buildProjectPositionDynamicFields(item),
            pricing_source: "proposal",
            base_price: item.line_price,
            min_price: 0,
            actual_price: item.line_price,
            notes: item.description_ru ?? null,
            sort_order: item.sort_order,
          },
        });
      }

      await onProjectCreated(tx, {
        actorUserId: session.user.user_id,
        projectId: created.project_id,
        proposalId: proposal.proposal_id,
        leadId: proposal.deal?.lead_id ?? null,
        dealId: proposal.deal_id,
        managerUserId: proposal.deal?.assigned_manager_id ?? null,
      });
      await tx.activityLog.create({
        data: {
          actor_user_id: session.user.user_id,
          entity_type: "project",
          entity_id: created.project_id,
          project_id: created.project_id,
          action_key: "project.created_from_proposal",
          message: `Проект создан из approved proposal ${proposal.title}.`,
          metadata: {
            proposal_id: proposal.proposal_id,
            deposit_id: proposal.deposit?.deposit_id ?? null,
            proposal_items_count: proposal.proposal_items.length,
          },
        },
      });
      await tx.proposalEvent.create({
        data: {
          proposal_id: proposal.proposal_id,
          actor_user_id: session.user.user_id,
          actor_type: "manager",
          event_key: "project.created",
          message: "На основе approved proposal и paid deposit создан project.",
          metadata: {
            project_id: created.project_id,
            project_code: created.project_code,
          },
        },
      });

      return created;
    });

    return createdProject;
  } catch (error) {
    if (isUniqueConstraintError(error, "proposal_id")) {
      const existingProject = await getProjectStubByProposalId(proposal.proposal_id);

      if (existingProject) {
        return existingProject;
      }
    }

    throw error;
  }
}

export async function getProjectExecutionOptions() {
  const [crews, installers] = await Promise.all([
    prisma.crew.findMany({
      where: {
        active: true,
      },
      orderBy: {
        name: "asc",
      },
      select: {
        crew_id: true,
        name: true,
      },
    }),
    prisma.user.findMany({
      where: {
        is_active: true,
        user_accesses: {
          some: {
            is_active: true,
            role: {
              code: ROLE_CODES.INSTALLER,
              is_active: true,
            },
          },
        },
      },
      orderBy: {
        full_name: "asc",
      },
      select: {
        user_id: true,
        full_name: true,
        email: true,
      },
    }),
  ]);

  return {
    crews,
    installers,
  };
}

export async function assignProjectSchedule(
  session: ProjectSession,
  input: {
    project_id: string;
    date: string;
    start_time?: string | null;
    end_time?: string | null;
    crew_id: string;
  },
) {
  const [project, crew, scheduledStatusId] = await Promise.all([
    prisma.project.findFirst({
      where: {
        project_id: input.project_id,
        ...getProjectWhereForSession(session),
      },
      select: {
        project_id: true,
        title: true,
      },
    }),
    prisma.crew.findFirst({
      where: {
        crew_id: input.crew_id,
        active: true,
      },
      select: {
        crew_id: true,
        name: true,
      },
    }),
    getProjectStatusId("SCHEDULED"),
  ]);

  if (!project) {
    return null;
  }

  if (!crew) {
    return "crew_not_found" as const;
  }

  const date = parseDateOnly(input.date);
  const startTime = parseTimeOnly(input.start_time);
  const endTime = parseTimeOnly(input.end_time);

  if (!date || (input.start_time && !startTime) || (input.end_time && !endTime)) {
    return "invalid_schedule" as const;
  }

  const assignment = await prisma.$transaction(async (tx) => {
    const saved = await upsertProjectScheduleAssignment(tx, {
      project_id: project.project_id,
      crew_id: crew.crew_id,
      date,
      start_time: startTime,
      end_time: endTime,
    });

    await tx.project.update({
      where: {
        project_id: project.project_id,
      },
      data: {
        install_date: date,
        start_time: startTime,
        end_time: endTime,
        ...(scheduledStatusId ? { project_status_id: scheduledStatusId } : {}),
      },
    });

    await tx.activityLog.create({
      data: {
        actor_user_id: session.user.user_id,
        entity_type: "project",
        entity_id: project.project_id,
        project_id: project.project_id,
        action_key: "schedule.assigned",
        message: `Для проекта назначен crew ${crew.name} на ${input.date}.`,
        metadata: {
          crew_id: crew.crew_id,
          date: input.date,
          start_time: input.start_time ?? null,
          end_time: input.end_time ?? null,
        },
      },
    });

    return saved;
  });

  return serializeScheduleAssignment(assignment);
}

export async function createInstallerJobsForProject(
  session: ProjectSession,
  input: {
    project_id: string;
    crew_id?: string | null;
    assignments: Array<{
      project_position_id: string;
      installer_id: string;
    }>;
  },
) {
  const project = await prisma.project.findFirst({
    where: {
      project_id: input.project_id,
      ...getProjectWhereForSession(session),
    },
    include: {
      project_positions: {
        orderBy: {
          sort_order: "asc",
        },
        select: {
          position_id: true,
          title: true,
        },
      },
      schedule_assignment: {
        select: {
          schedule_assignment_id: true,
          crew_id: true,
        },
      },
    },
  });

  if (!project) {
    return null;
  }

  if (input.assignments.length === 0) {
    return "missing_assignments" as const;
  }

  const projectPositionIds = project.project_positions.map((position) => position.position_id);
  const uniqueInstallerIds = Array.from(new Set(input.assignments.map((assignment) => assignment.installer_id)));

  const assignmentValidation = validateInstallerAssignments(projectPositionIds, input.assignments);

  if (assignmentValidation) {
    return assignmentValidation;
  }

  if (!project.schedule_assignment?.schedule_assignment_id) {
    return "missing_schedule" as const;
  }

  const scheduleAssignment = project.schedule_assignment;

  const installers = await prisma.user.findMany({
    where: {
      user_id: {
        in: uniqueInstallerIds,
      },
      is_active: true,
      user_accesses: {
        some: {
          is_active: true,
          role: {
            code: ROLE_CODES.INSTALLER,
            is_active: true,
          },
        },
      },
    },
    select: {
      user_id: true,
      full_name: true,
    },
  });

  if (installers.length !== uniqueInstallerIds.length) {
    return "invalid_installer" as const;
  }

  const crewId = scheduleAssignment.crew_id;
  const scheduledStatusId = await getProjectStatusId("SCHEDULED");

  const jobs = await prisma.$transaction(async (tx) => {
    const savedJobs = await upsertInstallerJobs(tx, {
      project_id: project.project_id,
      crew_id: crewId,
      schedule_assignment_id: scheduleAssignment.schedule_assignment_id,
      assignments: input.assignments,
    });

    await tx.project.update({
      where: {
        project_id: project.project_id,
      },
      data: {
        lead_installer_id: input.assignments[0]?.installer_id ?? null,
        ...(scheduledStatusId ? { project_status_id: scheduledStatusId } : {}),
      },
    });

    await tx.activityLog.create({
      data: {
        actor_user_id: session.user.user_id,
        entity_type: "project",
        entity_id: project.project_id,
        project_id: project.project_id,
        action_key: "crew.assigned",
        message: `Для проекта назначены installers по ${input.assignments.length} позициям.`,
        metadata: {
          crew_id: crewId,
          assignments: input.assignments,
        },
      },
    });

    await onInstallationAssigned(tx, {
      actorUserId: session.user.user_id,
      projectId: project.project_id,
      dealId: project.deal_id,
      managerUserId: project.manager_id,
      installerIds: uniqueInstallerIds,
    });

    return savedJobs;
  });

  return jobs.map((job) => ({
    installer_job_id: job.installer_job_id,
    status: job.status,
    installer: job.installer,
    position: job.position,
    schedule_assignment: job.schedule_assignment
      ? {
          schedule_assignment_id: job.schedule_assignment.schedule_assignment_id,
          date: job.schedule_assignment.date,
          start_time: job.schedule_assignment.start_time,
          end_time: job.schedule_assignment.end_time,
          crew: {
            crew_id: job.schedule_assignment.crew.crew_id,
            name: job.schedule_assignment.crew.name,
          },
        }
      : null,
  }));
}

export async function assignInstallationToProject(
  session: ProjectSession,
  input: {
    project_id: string;
    date: string;
    start_time?: string | null;
    end_time?: string | null;
    crew_id: string;
    manager_notes?: string | null;
    assignments: InstallerAssignmentInput[];
  },
) {
  const [project, crew, scheduledStatusId] = await Promise.all([
    prisma.project.findFirst({
      where: {
        project_id: input.project_id,
        ...getProjectWhereForSession(session),
      },
      include: {
        project_positions: {
          orderBy: {
            sort_order: "asc",
          },
          select: {
            position_id: true,
          },
        },
      },
    }),
    prisma.crew.findFirst({
      where: {
        crew_id: input.crew_id,
        active: true,
      },
      select: {
        crew_id: true,
        name: true,
      },
    }),
    getProjectStatusId("SCHEDULED"),
  ]);

  if (!project) {
    return null;
  }

  if (!crew) {
    return "crew_not_found" as const;
  }

  const date = parseDateOnly(input.date);
  const startTime = parseTimeOnly(input.start_time);
  const endTime = parseTimeOnly(input.end_time);

  if (!date || (input.start_time && !startTime) || (input.end_time && !endTime)) {
    return "invalid_schedule" as const;
  }

  if (input.assignments.length === 0) {
    return "missing_assignments" as const;
  }

  const projectPositionIds = project.project_positions.map((position) => position.position_id);
  const assignmentValidation = validateInstallerAssignments(projectPositionIds, input.assignments);

  if (assignmentValidation) {
    return assignmentValidation;
  }

  const uniqueInstallerIds = Array.from(new Set(input.assignments.map((assignment) => assignment.installer_id)));
  const installers = await prisma.user.findMany({
    where: {
      user_id: {
        in: uniqueInstallerIds,
      },
      is_active: true,
      user_accesses: {
        some: {
          is_active: true,
          role: {
            code: ROLE_CODES.INSTALLER,
            is_active: true,
          },
        },
      },
    },
    select: {
      user_id: true,
    },
  });

  if (installers.length !== uniqueInstallerIds.length) {
    return "invalid_installer" as const;
  }

  const result = await prisma.$transaction(async (tx) => {
    const scheduleAssignment = await upsertProjectScheduleAssignment(tx, {
      project_id: project.project_id,
      crew_id: crew.crew_id,
      date,
      start_time: startTime,
      end_time: endTime,
    });
    const jobs = await upsertInstallerJobs(tx, {
      project_id: project.project_id,
      crew_id: crew.crew_id,
      schedule_assignment_id: scheduleAssignment.schedule_assignment_id,
      assignments: input.assignments,
    });

    await tx.project.update({
      where: {
        project_id: project.project_id,
      },
      data: {
        install_date: date,
        start_time: startTime,
        end_time: endTime,
        lead_installer_id: input.assignments[0]?.installer_id ?? null,
        manager_notes: input.manager_notes?.trim() || null,
        ...(scheduledStatusId ? { project_status_id: scheduledStatusId } : {}),
      },
    });

    await tx.activityLog.create({
      data: {
        actor_user_id: session.user.user_id,
        entity_type: "project",
        entity_id: project.project_id,
        project_id: project.project_id,
        action_key: "installation.assigned",
        message: `Для проекта назначены schedule и installers по ${input.assignments.length} позициям.`,
        metadata: {
          schedule_assignment_id: scheduleAssignment.schedule_assignment_id,
          crew_id: crew.crew_id,
          date: input.date,
          start_time: input.start_time ?? null,
          end_time: input.end_time ?? null,
          manager_notes: input.manager_notes?.trim() || null,
          assignments: input.assignments,
        },
      },
    });

    await onInstallationAssigned(tx, {
      actorUserId: session.user.user_id,
      projectId: project.project_id,
      dealId: project.deal_id,
      managerUserId: project.manager_id,
      installerIds: uniqueInstallerIds,
    });

    return {
      assignment: serializeScheduleAssignment(scheduleAssignment),
      jobs,
    };
  });

  return {
    assignment: result.assignment,
    items: result.jobs.map((job) => ({
      installer_job_id: job.installer_job_id,
      status: job.status,
      installer: job.installer,
      position: job.position,
      schedule_assignment: job.schedule_assignment
        ? {
            schedule_assignment_id: job.schedule_assignment.schedule_assignment_id,
            date: job.schedule_assignment.date,
            start_time: job.schedule_assignment.start_time,
            end_time: job.schedule_assignment.end_time,
            crew: {
              crew_id: job.schedule_assignment.crew.crew_id,
              name: job.schedule_assignment.crew.name,
            },
          }
        : null,
    })),
  };
}

export async function getInstallerJobsForSession(session: ProjectSession) {
  const jobs = await prisma.installerJob.findMany({
    where: buildInstallerJobWhereForSession(session),
    include: {
      installer: {
        select: {
          user_id: true,
          full_name: true,
          email: true,
        },
      },
      crew: {
        select: {
          crew_id: true,
          name: true,
        },
      },
      position: {
        include: {
          service_type: {
            select: {
              service_code: true,
              name_ru: true,
            },
          },
        },
      },
      schedule_assignment: {
        include: {
          crew: {
            select: {
              crew_id: true,
              name: true,
            },
          },
        },
      },
      project: {
        include: {
          client: {
            select: {
              client_id: true,
              name: true,
              phone: true,
            },
          },
        },
      },
    },
    orderBy: [{ completed_at: "asc" }, { created_at: "desc" }],
  });

  return jobs.map((job) => ({
    installer_job_id: job.installer_job_id,
    status: job.status,
    on_the_way_at: job.on_the_way_at,
    started_at: job.started_at,
    paused_at: job.paused_at,
    completed_at: job.completed_at,
    crew: job.schedule_assignment?.crew
      ? {
          crew_id: job.schedule_assignment.crew.crew_id,
          name: job.schedule_assignment.crew.name,
        }
      : job.crew
      ? {
          crew_id: job.crew.crew_id,
          name: job.crew.name,
        }
      : null,
    schedule: job.schedule_assignment
      ? {
          schedule_assignment_id: job.schedule_assignment.schedule_assignment_id,
          date: job.schedule_assignment.date,
          start_time: job.schedule_assignment.start_time,
          end_time: job.schedule_assignment.end_time,
          crew: {
            crew_id: job.schedule_assignment.crew.crew_id,
            name: job.schedule_assignment.crew.name,
          },
        }
      : null,
    project: {
      project_id: job.project.project_id,
      project_code: job.project.project_code,
      title: job.project.title,
      address: job.project.address,
      install_date: job.project.install_date,
      start_time: job.project.start_time,
      end_time: job.project.end_time,
      client: job.project.client
        ? {
            client_id: job.project.client.client_id,
            name: job.project.client.name,
            phone: job.project.client.phone,
          }
        : null,
    },
    position: job.position
      ? {
          position_id: job.position.position_id,
          title: job.position.title ?? job.position.service_type.name_ru,
          service_type: {
            service_code: job.position.service_type.service_code,
            name_ru: job.position.service_type.name_ru,
          },
          notes: job.position.notes,
          dynamic_fields: omitSensitiveFinancialFields(asJsonRecord(job.position.dynamic_fields)),
        }
      : null,
  }));
}

export async function getInstallerJobByIdForSession(session: ProjectSession, installerJobId: string) {
  const job = await prisma.installerJob.findFirst({
    where: buildInstallerJobWhereForSession(session, installerJobId),
    include: {
      installer: {
        select: {
          user_id: true,
          full_name: true,
          email: true,
        },
      },
      crew: {
        select: {
          crew_id: true,
          name: true,
        },
      },
      position: {
        include: {
          service_type: {
            select: {
              service_code: true,
              name_ru: true,
            },
          },
          film: {
            select: {
              brand_name_ru: true,
              model_name_ru: true,
              category_name_ru: true,
            },
          },
        },
      },
      schedule_assignment: {
        include: {
          crew: {
            select: {
              crew_id: true,
              name: true,
            },
          },
        },
      },
      project: {
        include: {
          client: {
            select: {
              client_id: true,
              name: true,
              phone: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!job) {
    return null;
  }

  return {
    installer_job_id: job.installer_job_id,
    status: job.status,
    on_the_way_at: job.on_the_way_at,
    started_at: job.started_at,
    paused_at: job.paused_at,
    completed_at: job.completed_at,
    installer_comment: job.installer_comment,
    crew: job.schedule_assignment?.crew
      ? {
          crew_id: job.schedule_assignment.crew.crew_id,
          name: job.schedule_assignment.crew.name,
        }
      : job.crew
      ? {
          crew_id: job.crew.crew_id,
          name: job.crew.name,
        }
      : null,
    schedule: job.schedule_assignment
      ? {
          schedule_assignment_id: job.schedule_assignment.schedule_assignment_id,
          date: job.schedule_assignment.date,
          start_time: job.schedule_assignment.start_time,
          end_time: job.schedule_assignment.end_time,
          crew: {
            crew_id: job.schedule_assignment.crew.crew_id,
            name: job.schedule_assignment.crew.name,
          },
        }
      : null,
    installer: job.installer,
    project: {
      project_id: job.project.project_id,
      project_code: job.project.project_code,
      title: job.project.title,
      address: job.project.address,
      install_date: job.project.install_date,
      start_time: job.project.start_time,
      end_time: job.project.end_time,
      manager_notes: job.project.manager_notes,
      installer_notes: job.project.installer_notes,
      what_to_bring: job.project.what_to_bring,
      client: job.project.client
        ? {
            client_id: job.project.client.client_id,
            name: job.project.client.name,
            phone: job.project.client.phone,
            email: job.project.client.email,
          }
        : null,
    },
    position: job.position
      ? {
          position_id: job.position.position_id,
          title: job.position.title ?? job.position.service_type.name_ru,
          service_type: {
            service_code: job.position.service_type.service_code,
            name_ru: job.position.service_type.name_ru,
          },
          film: job.position.film
            ? {
                category_name_ru: job.position.film.category_name_ru,
                brand_name_ru: job.position.film.brand_name_ru,
                model_name_ru: job.position.film.model_name_ru,
              }
            : null,
          notes: job.position.notes,
          dynamic_fields: omitSensitiveFinancialFields(asJsonRecord(job.position.dynamic_fields)),
        }
      : null,
  };
}

export async function updateInstallerJobStatus(
  session: ProjectSession,
  installerJobId: string,
  status: string,
) {
  const allowedStatuses = new Set(Object.values(INSTALLER_JOB_STATUSES));

  if (!allowedStatuses.has(status as (typeof INSTALLER_JOB_STATUSES)[keyof typeof INSTALLER_JOB_STATUSES])) {
    return "invalid_status" as const;
  }

  const job = await prisma.installerJob.findFirst({
    where: buildInstallerJobWhereForSession(session, installerJobId),
    select: {
      installer_job_id: true,
      project_id: true,
      project_position_id: true,
      status: true,
      project: {
        select: {
          deal_id: true,
          manager_id: true,
        },
      },
    },
  });

  if (!job) {
    return null;
  }

  const nextStatuses = INSTALLER_JOB_TRANSITIONS[job.status] ?? [];

  if (!nextStatuses.includes(status)) {
    return "invalid_transition" as const;
  }

  const [projectInProgressStatusId, projectCompletedStatusId, positionInProgressStatusId, positionCompletedStatusId] =
    await Promise.all([
      getProjectStatusId("IN_PROGRESS"),
      getProjectStatusId("COMPLETED"),
      getPositionStatusId("IN_PROGRESS"),
      getPositionStatusId("COMPLETED"),
    ]);

  const updated = await prisma.$transaction(async (tx) => {
    const timestamp = new Date();
    const statusData: Prisma.InstallerJobUpdateInput = {
      status,
      ...(status === INSTALLER_JOB_STATUSES.ON_THE_WAY ? { on_the_way_at: timestamp } : {}),
      ...(status === INSTALLER_JOB_STATUSES.STARTED ? { started_at: timestamp } : {}),
      ...(status === INSTALLER_JOB_STATUSES.PAUSED ? { paused_at: timestamp } : {}),
      ...(status === INSTALLER_JOB_STATUSES.COMPLETED ? { completed_at: timestamp } : {}),
    };

    const saved = await tx.installerJob.update({
      where: {
        installer_job_id: installerJobId,
      },
      data: statusData,
    });

    if (job.project_position_id) {
      if (status === INSTALLER_JOB_STATUSES.STARTED && positionInProgressStatusId) {
        await tx.projectPosition.update({
          where: {
            position_id: job.project_position_id,
          },
          data: {
            position_status_id: positionInProgressStatusId,
          },
        });
      }

      if (status === INSTALLER_JOB_STATUSES.COMPLETED && positionCompletedStatusId) {
        await tx.projectPosition.update({
          where: {
            position_id: job.project_position_id,
          },
          data: {
            position_status_id: positionCompletedStatusId,
          },
        });
      }
    }

    if (
      (status === INSTALLER_JOB_STATUSES.ON_THE_WAY || status === INSTALLER_JOB_STATUSES.STARTED) &&
      projectInProgressStatusId
    ) {
      await tx.project.update({
        where: {
          project_id: job.project_id,
        },
        data: {
          project_status_id: projectInProgressStatusId,
        },
      });
    }

    if (status === INSTALLER_JOB_STATUSES.COMPLETED) {
      await recordInstallerPayrollAccrual(tx, installerJobId, timestamp);
    }

    if (status === INSTALLER_JOB_STATUSES.COMPLETED && projectCompletedStatusId) {
      const remainingOpenJobs = await tx.installerJob.count({
        where: {
          project_id: job.project_id,
          status: {
            not: INSTALLER_JOB_STATUSES.COMPLETED,
          },
        },
      });

      if (remainingOpenJobs === 0) {
        await tx.project.update({
          where: {
            project_id: job.project_id,
          },
          data: {
            project_status_id: projectCompletedStatusId,
          },
        });

        await onProjectCompleted(tx, {
          actorUserId: session.user.user_id,
          projectId: job.project_id,
          dealId: job.project.deal_id,
          managerUserId: job.project.manager_id,
        });
      }
    }

    await tx.activityLog.create({
      data: {
        actor_user_id: session.user.user_id,
        entity_type: "project",
        entity_id: job.project_id,
        project_id: job.project_id,
        action_key: `installer_job.${status}`,
        message: `Installer job переведен в статус ${status}.`,
        metadata: {
          installer_job_id: installerJobId,
          project_position_id: job.project_position_id,
        },
      },
    });

    if (status === INSTALLER_JOB_STATUSES.STARTED) {
      await onJobStarted(tx, {
        actorUserId: session.user.user_id,
        projectId: job.project_id,
        dealId: job.project.deal_id,
        managerUserId: job.project.manager_id,
        installerJobId,
      });
    }

    return saved;
  });

  return updated;
}

export async function addProjectFile(
  session: ProjectSession,
  projectId: string,
  input: {
    file_type: string;
    original_name: string;
    file_url: string;
    mime_type?: string | null;
    size_bytes?: number | null;
    storage_provider?: string;
    storage_bucket?: string | null;
    storage_key: string;
    position_id?: string | null;
    installer_job_id?: string | null;
  },
) {
  const project = await prisma.project.findFirst({
    where: {
      project_id: projectId,
      ...getProjectWhereForSession(session),
    },
    select: {
      project_id: true,
      client_id: true,
      deal_id: true,
      manager_id: true,
      title: true,
    },
  });

  if (!project) {
    return null;
  }

  const file = await prisma.attachmentFile.create({
    data: {
      project_id: project.project_id,
      deal_id: project.deal_id,
      uploaded_by: session.user.user_id,
      file_type: input.file_type,
      original_name: input.original_name,
      storage_provider: input.storage_provider ?? "manual",
      storage_bucket: input.storage_bucket ?? null,
      storage_key: input.storage_key,
      file_url: input.file_url,
      mime_type: input.mime_type ?? null,
      size_bytes: input.size_bytes ?? null,
      position_id: input.position_id ?? null,
      installer_job_id: input.installer_job_id ?? null,
    },
  });

  await prisma.activityLog.create({
    data: {
      actor_user_id: session.user.user_id,
      entity_type: "attachment_file",
      entity_id: file.file_id,
      project_id: project.project_id,
      action_key: "project.file.uploaded",
      message: `В проект загружен файл ${file.original_name}.`,
      metadata: {
        file_type: file.file_type,
        file_url: file.file_url,
        storage_key: file.storage_key,
      },
    },
  });

  return file;
}

async function fetchProjectsForSession(session: ProjectSession) {
  return prisma.project.findMany({
    where: getProjectWhereForSession(session),
    include: {
      client: {
        select: {
          client_id: true,
          client_code: true,
          name: true,
        },
      },
      city: {
        select: {
          city_id: true,
          name_ru: true,
        },
      },
      project_status: true,
      payment_status: true,
      lead_installer: {
        select: {
          user_id: true,
          full_name: true,
        },
      },
      project_positions: {
        include: {
          service_type: true,
          position_status: true,
          complexity_level: true,
          position_addons: {
            include: {
              service_addon: true,
            },
          },
        },
        orderBy: {
          sort_order: "asc",
        },
      },
      installer_jobs: {
        include: {
          installer: {
            select: {
              user_id: true,
              full_name: true,
            },
          },
          schedule_assignment: {
            include: {
              crew: {
                select: {
                  crew_id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
      schedule_assignment: {
        include: {
          crew: {
            select: {
              crew_id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: [{ install_date: "asc" }, { created_at: "desc" }],
  });
}

export async function listProjectsForSession(session: ProjectSession) {
  const projects = await fetchProjectsForSession(session);

  return projects.map((project) => {
    const financeLines = project.project_positions.map(calculatePositionFinance);
    const revenueTotal = Number(financeLines.reduce((sum, line) => sum + line.revenue_subtotal, 0).toFixed(2));
    const estimatedCostTotal = Number(financeLines.reduce((sum, line) => sum + line.estimated_cost, 0).toFixed(2));
    const estimatedProfitTotal = Number(
      financeLines.reduce((sum, line) => sum + line.estimated_profit, 0).toFixed(2),
    );
    const marginPercent =
      revenueTotal > 0 ? Number(((estimatedProfitTotal / revenueTotal) * 100).toFixed(2)) : 0;
    const assignedInstallers = Array.from(
      new Map(
        project.installer_jobs.map((job) => [
          job.installer.user_id,
          { user_id: job.installer.user_id, full_name: job.installer.full_name },
        ]),
      ).values(),
    );
    const nextSchedule = project.schedule_assignment ?? null;

    return {
      project_id: project.project_id,
      project_code: project.project_code,
      title: project.title,
      priority: project.priority,
      problem_flag: project.problem_flag,
      address: project.address,
      install_date: project.install_date,
      start_time: project.start_time,
      end_time: project.end_time,
      client: project.client
        ? {
            client_id: project.client.client_id,
            client_code: project.client.client_code,
            name: project.client.name,
          }
        : null,
      city: project.city
        ? {
            city_id: project.city.city_id,
            name_ru: project.city.name_ru,
          }
        : null,
      project_status: {
        status_code: project.project_status.status_code,
        name_ru: project.project_status.name_ru,
        color_token: project.project_status.color_token,
      },
      payment_status: project.payment_status
        ? {
            status_code: project.payment_status.status_code,
            name_ru: project.payment_status.name_ru,
            color_token: project.payment_status.color_token,
          }
        : null,
      lead_installer: project.lead_installer
        ? {
            user_id: project.lead_installer.user_id,
            full_name: project.lead_installer.full_name,
          }
        : null,
      helpers_count: assignedInstallers.filter((installer) => installer.user_id !== project.lead_installer_id).length,
      assigned_installers: assignedInstallers,
      service_summary: project.project_positions.map((position) => position.service_type.name_ru).join(" / "),
      positions_count: project.project_positions.length,
      schedule: nextSchedule
        ? {
            schedule_assignment_id: nextSchedule.schedule_assignment_id,
            date: nextSchedule.date,
            start_time: nextSchedule.start_time,
            end_time: nextSchedule.end_time,
            crew: nextSchedule.crew.name,
          }
        : null,
      finance_snapshot: {
        revenue_total: revenueTotal,
        estimated_cost_total: estimatedCostTotal,
        estimated_profit_total: estimatedProfitTotal,
        margin_percent: marginPercent,
        below_minimum_positions: financeLines.filter((line) => line.below_minimum_warning).length,
      },
      status_flags: {
        is_new: isRecentlyCreated(project.created_at),
        is_overdue: isOverdueProject(project),
        needs_attention: project.problem_flag || isOverdueProject(project),
      },
    };
  });
}

export async function getProjectCardByIdForSession(session: ProjectSession, projectId: string) {
  const project = await prisma.project.findFirst({
    where: {
      project_id: projectId,
      ...getProjectWhereForSession(session),
    },
    include: {
      client: true,
      city: true,
      manager: {
        select: {
          user_id: true,
          full_name: true,
          email: true,
        },
      },
      lead_installer: {
        select: {
          user_id: true,
          full_name: true,
          email: true,
        },
      },
      deal: {
        select: {
          deal_id: true,
          deal_code: true,
          title: true,
          proposals: {
            orderBy: {
              created_at: "desc",
            },
            take: 1,
            select: {
              proposal_id: true,
              proposal_code: true,
              status: true,
              selected_total_amount: true,
              currency: true,
            },
          },
        },
      },
      proposal: {
        select: {
          proposal_id: true,
          proposal_code: true,
          status: true,
          selected_total_amount: true,
          currency: true,
        },
      },
      project_status: true,
      payment_status: true,
      schedule_assignment: {
        include: {
          crew: {
            select: {
              crew_id: true,
              name: true,
            },
          },
        },
      },
      project_positions: {
        include: {
          service_type: true,
          film: true,
          position_status: true,
          complexity_level: true,
          installer_job: {
            include: {
              installer: {
                select: {
                  user_id: true,
                  full_name: true,
                },
              },
              schedule_assignment: {
                include: {
                  crew: {
                    select: {
                      crew_id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
          attachments_files: {
            include: {
              uploaded_by_user: {
                select: {
                  user_id: true,
                  full_name: true,
                },
              },
            },
          },
          position_addons: {
            include: {
              service_addon: true,
            },
          },
        },
        orderBy: {
          sort_order: "asc",
        },
      },
      installer_jobs: {
        include: {
          installer: {
            select: {
              user_id: true,
              full_name: true,
            },
          },
          schedule_assignment: {
            include: {
              crew: {
                select: {
                  crew_id: true,
                  name: true,
                },
              },
            },
          },
          position: {
            select: {
              position_id: true,
              title: true,
            },
          },
        },
        orderBy: [{ created_at: "asc" }],
      },
      attachments_files: {
        include: {
          uploaded_by_user: {
            select: {
              user_id: true,
              full_name: true,
            },
          },
          position: {
            select: {
              position_id: true,
              title: true,
            },
          },
        },
        orderBy: {
          created_at: "desc",
        },
      },
      documents: {
        include: {
          document_type: true,
          file: {
            select: {
              file_id: true,
              file_url: true,
              original_name: true,
            },
          },
          created_by_user: {
            select: {
              user_id: true,
              full_name: true,
            },
          },
        },
        orderBy: {
          created_at: "desc",
        },
      },
      activity_logs: {
        include: {
          actor_user: {
            select: {
              user_id: true,
              full_name: true,
            },
          },
        },
        orderBy: {
          created_at: "desc",
        },
      },
    },
  });

  if (!project) {
    return null;
  }

  const [notifications, emailActions] = await Promise.all([
    prisma.notification.findMany({
      where: {
        entity_type: "project",
        entity_id: project.project_id,
      },
      include: {
        actor_user: {
          select: {
            user_id: true,
            full_name: true,
          },
        },
        recipient_user: {
          select: {
            user_id: true,
            full_name: true,
          },
        },
      },
      orderBy: {
        created_at: "desc",
      },
    }),
    prisma.emailAction.findMany({
      where: {
        entity_type: "project",
        entity_id: project.project_id,
      },
      include: {
        created_by_user: {
          select: {
            user_id: true,
            full_name: true,
          },
        },
      },
      orderBy: {
        created_at: "desc",
      },
    }),
  ]);

  const positionCards = project.project_positions.map((position) => {
    const finance = calculatePositionFinance(position);
    const dynamic = asJsonRecord(position.dynamic_fields);

    return {
      position_id: position.position_id,
      title: position.title,
      service_type: {
        service_code: position.service_type.service_code,
        name_ru: position.service_type.name_ru,
      },
      film: position.film
        ? {
            category_name_ru: position.film.category_name_ru,
            brand_name_ru: position.film.brand_name_ru,
            model_name_ru: position.film.model_name_ru,
            thickness: position.film.thickness,
          }
        : null,
      position_status: {
        status_code: position.position_status.status_code,
        name_ru: position.position_status.name_ru,
      },
      complexity_level: position.complexity_level
        ? {
            level_code: position.complexity_level.level_code,
            name_ru: position.complexity_level.name_ru,
            multiplier: toNumber(position.complexity_level.multiplier),
          }
        : null,
      pricing_source: position.pricing_source,
      base_price: toNumber(position.base_price),
      min_price: toNumber(position.min_price),
      actual_price: toNumber(position.actual_price),
      notes: position.notes,
      dynamic_fields: dynamic,
      assigned_installers: position.installer_job
        ? [
            {
              installer_job_id: position.installer_job.installer_job_id,
              user_id: position.installer_job.installer.user_id,
              full_name: position.installer_job.installer.full_name,
              status: position.installer_job.status,
              crew_name: position.installer_job.schedule_assignment?.crew.name ?? null,
            },
          ]
        : [],
      addons: position.position_addons.map((addon) => ({
        position_addon_id: addon.position_addon_id,
        name_ru: formatAddonLabel(addon),
        quantity: toNumber(addon.quantity),
        unit_price: toNumber(addon.unit_price),
        total_price: toNumber(addon.total_price),
      })),
      files_count: position.attachments_files.length,
      finance,
    };
  });

  const sourceProposal = project.proposal ?? project.deal?.proposals[0] ?? null;
  const proposalTotal = sourceProposal ? toNumber(sourceProposal.selected_total_amount) : 0;
  const revenueTotal = Number(positionCards.reduce((sum, position) => sum + position.finance.revenue_subtotal, 0).toFixed(2));
  const estimatedCostTotal = Number(positionCards.reduce((sum, position) => sum + position.finance.estimated_cost, 0).toFixed(2));
  const estimatedProfitTotal = Number(
    positionCards.reduce((sum, position) => sum + position.finance.estimated_profit, 0).toFixed(2),
  );
  const addonRevenueTotal = Number(positionCards.reduce((sum, position) => sum + position.finance.addons_revenue, 0).toFixed(2));
  const marginPercent =
    revenueTotal > 0 ? Number(((estimatedProfitTotal / revenueTotal) * 100).toFixed(2)) : 0;

  const assignedInstallers = Array.from(
    new Map(
      project.installer_jobs.map((job) => [
        job.installer.user_id,
        {
          user_id: job.installer.user_id,
          full_name: job.installer.full_name,
        },
      ]),
    ).values(),
  );
  const helpers = assignedInstallers.filter((installer) => installer.user_id !== project.lead_installer_id);
  const crewLabels = Array.from(
    new Set(
      [
        project.schedule_assignment?.crew.name ?? null,
        ...project.installer_jobs.map((job) => job.schedule_assignment?.crew.name ?? null),
      ].filter((value): value is string => Boolean(value)),
    ),
  );

  return {
    project_id: project.project_id,
    project_code: project.project_code,
    title: project.title,
    address: project.address,
    zip_code: project.zip_code,
    install_date: project.install_date,
    start_time: project.start_time,
    end_time: project.end_time,
    priority: project.priority,
    problem_flag: project.problem_flag,
    manager_notes: project.manager_notes,
    installer_notes: project.installer_notes,
    what_to_bring: project.what_to_bring,
    client: project.client
      ? {
          client_id: project.client.client_id,
          client_code: project.client.client_code,
          name: project.client.name,
          phone: project.client.phone,
          email: project.client.email,
          service_address: project.client.service_address,
        }
      : null,
    city: project.city
      ? {
          city_id: project.city.city_id,
          name_ru: project.city.name_ru,
        }
      : null,
    manager: project.manager,
    lead_installer: project.lead_installer,
    project_status: {
      status_code: project.project_status.status_code,
      name_ru: project.project_status.name_ru,
    },
    payment_status: project.payment_status
      ? {
          status_code: project.payment_status.status_code,
          name_ru: project.payment_status.name_ru,
        }
      : null,
    proposal: sourceProposal
      ? {
          proposal_id: sourceProposal.proposal_id,
          proposal_code: sourceProposal.proposal_code,
          status: sourceProposal.status,
          selected_total_amount: proposalTotal,
          currency: sourceProposal.currency,
        }
      : null,
    deal: project.deal
      ? {
          deal_id: project.deal.deal_id,
          deal_code: project.deal.deal_code,
          title: project.deal.title,
          latest_proposal: sourceProposal
            ? {
                proposal_id: sourceProposal.proposal_id,
                proposal_code: sourceProposal.proposal_code,
                status: sourceProposal.status,
                selected_total_amount: proposalTotal,
                currency: sourceProposal.currency,
              }
            : null,
        }
      : null,
    crew_assignment: {
      lead_installer: project.lead_installer,
      helpers,
      assigned_installers: assignedInstallers,
      crew_labels: crewLabels,
      active_jobs: project.installer_jobs.filter((job) => ACTIVE_INSTALLER_JOB_STATUSES.has(job.status)).length,
    },
    positions: positionCards,
    schedule: project.schedule_assignment
      ? [
          {
            schedule_assignment_id: project.schedule_assignment.schedule_assignment_id,
            date: project.schedule_assignment.date,
            start_time: project.schedule_assignment.start_time,
            end_time: project.schedule_assignment.end_time,
            crew: {
              crew_id: project.schedule_assignment.crew.crew_id,
              name: project.schedule_assignment.crew.name,
            },
            installers: project.installer_jobs
              .filter((job) => job.schedule_assignment?.schedule_assignment_id === project.schedule_assignment?.schedule_assignment_id)
              .map((job) => ({
                installer_job_id: job.installer_job_id,
                user_id: job.installer.user_id,
                full_name: job.installer.full_name,
                status: job.status,
              })),
          },
        ]
      : [],
    files: project.attachments_files.map((file) => ({
      file_id: file.file_id,
      file_type: file.file_type,
      original_name: file.original_name,
      file_url: file.file_url,
      mime_type: file.mime_type,
      created_at: file.created_at,
      uploaded_by: file.uploaded_by_user.full_name,
      position_title: file.position?.title ?? null,
    })),
    documents: project.documents.map((document) => ({
      document_id: document.document_id,
      title: document.title,
      status: document.status,
      language_code: document.language_code,
      created_at: document.created_at,
      document_type: document.document_type.name_ru,
      file_url: document.file?.file_url ?? null,
      created_by: document.created_by_user.full_name,
    })),
    activity: project.activity_logs.map((activity) => ({
      activity_id: activity.activity_id,
      action_key: activity.action_key,
      message: activity.message,
      created_at: activity.created_at,
      actor: activity.actor_user?.full_name ?? "Система",
    })),
    email_actions: emailActions.map((email) => ({
      email_action_id: email.email_action_id,
      recipient_email: email.recipient_email,
      subject: email.subject,
      status: email.status,
      sent_at: email.sent_at,
      created_at: email.created_at,
      created_by: email.created_by_user.full_name,
    })),
    notifications: notifications.map((notification) => ({
      notification_id: notification.notification_id,
      type_key: notification.type_key,
      title: notification.title,
      message: notification.message,
      is_read: notification.is_read,
      created_at: notification.created_at,
      actor: notification.actor_user?.full_name ?? "Система",
      recipient: notification.recipient_user.full_name,
    })),
    finance_snapshot: {
      proposal_total: proposalTotal,
      revenue_total: revenueTotal,
      estimated_cost_total: estimatedCostTotal,
      estimated_profit_total: estimatedProfitTotal,
      addon_revenue_total: addonRevenueTotal,
      below_minimum_positions: positionCards.filter((position) => position.finance.below_minimum_warning).length,
      estimated_margin_percent: marginPercent,
    },
  };
}
