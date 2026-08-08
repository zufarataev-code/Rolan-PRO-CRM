import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { ROLE_CODES } from "@/lib/auth/constants";
import { logSalesActivity } from "@/features/sales/activity";
import { serializeProposalDetail, serializeProposalListItem, serializePublicProposal } from "@/features/proposals/serializers";
import { AGREEMENT_STATUSES, DEPOSIT_STATUSES, PROPOSAL_STATUSES } from "@/features/proposals/api";
import { onDepositPaid, onProposalApproved, onProposalSent } from "@/features/core/events";
import { getServiceCalculatorBootstrap } from "@/features/calculator/bootstrap";
import { calculateLineEconomics, calculateLineTotal, getServiceAddonById, getServiceTypeById } from "@/features/calculator/logic";
import type { CalculatorCard } from "@/features/calculator/types";

type SessionLike = {
  user: {
    user_id: string;
  };
  roles: string[];
};

type ProposalDbClient = typeof prisma | Prisma.TransactionClient;

function isOwner(session: SessionLike) {
  return session.roles.includes(ROLE_CODES.OWNER);
}

function toNumber(value: { toString(): string } | null | undefined) {
  return value ? Number(value.toString()) : 0;
}

function jsonOrDbNull(value: Prisma.InputJsonValue | null | undefined) {
  return value ?? Prisma.DbNull;
}

function jsonOrUndefined(value: Prisma.InputJsonValue | null | undefined) {
  if (value === undefined) {
    return undefined;
  }

  return value ?? Prisma.DbNull;
}

function buildProposalWhere(session: SessionLike, proposalId?: string) {
  if (isOwner(session)) {
    return proposalId ? { proposal_id: proposalId } : {};
  }

  return {
    ...(proposalId ? { proposal_id: proposalId } : {}),
    OR: [{ created_by: session.user.user_id }, { deal: { assigned_manager_id: session.user.user_id } }],
  };
}

async function getPipelineStatusId(statusCode: string) {
  const status = await prisma.pipelineStatus.findUnique({
    where: {
      status_code: statusCode,
    },
    select: {
      pipeline_status_id: true,
    },
  });

  return status?.pipeline_status_id ?? null;
}

function makeProposalAccessToken() {
  return `proposal_${crypto.randomUUID().replace(/-/g, "")}`;
}

function isProposalApproved(status: string) {
  return status === PROPOSAL_STATUSES.APPROVED;
}

function isProposalPublicLocked(status: string) {
  return status === PROPOSAL_STATUSES.AGREEMENT_SIGNED || isProposalApproved(status);
}

function estimateLinePrice(serviceCode: string, sqft: number, thickness?: string | null) {
  switch (serviceCode) {
    case "SMART_FILM":
      return sqft * 85;
    case "SOLAR_FILM":
      return sqft * 19;
    case "SAFETY_FILM": {
      const base = sqft * 24;
      return thickness?.includes("8") ? base * 1.12 : base;
    }
    case "WASHING":
      return sqft * 1.5;
    case "REMOVAL":
      return sqft * 2.5;
    case "SILICONE":
      return sqft * 1.75;
    case "ELECTRICAL_WORK":
      return 350;
    default:
      return Math.max(100, sqft * 12);
  }
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeDynamicFields(value: unknown): Prisma.InputJsonObject | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const normalizedEntries = Object.entries(record).filter(([, entryValue]) => {
    if (entryValue === null || entryValue === undefined) {
      return false;
    }

    if (typeof entryValue === "string") {
      return entryValue.trim().length > 0;
    }

    return typeof entryValue === "number" || typeof entryValue === "boolean";
  });

  return normalizedEntries.length > 0
    ? (Object.fromEntries(normalizedEntries) as Prisma.InputJsonObject)
    : null;
}

function normalizeAddonsSnapshot(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((entry) => {
      const record = asRecord(entry);

      if (!record) {
        return null;
      }

      return {
        id:
          typeof record.id === "string" && record.id.trim()
            ? record.id.trim()
            : `addon-${crypto.randomUUID().replace(/-/g, "")}`,
        service_addon_id:
          typeof record.service_addon_id === "string" && record.service_addon_id.trim()
            ? record.service_addon_id.trim()
            : null,
        addon_code:
          typeof record.addon_code === "string" && record.addon_code.trim() ? record.addon_code.trim() : null,
        name_ru: typeof record.name_ru === "string" && record.name_ru.trim() ? record.name_ru.trim() : null,
        name_en: typeof record.name_en === "string" && record.name_en.trim() ? record.name_en.trim() : null,
        unit_type:
          typeof record.unit_type === "string" && record.unit_type.trim() ? record.unit_type.trim() : null,
        quantity:
          typeof record.quantity === "number"
            ? record.quantity
            : typeof record.quantity === "string" && record.quantity.trim()
              ? Number(record.quantity)
              : null,
        unit_price_override:
          typeof record.unit_price_override === "number"
            ? record.unit_price_override
            : typeof record.unit_price_override === "string" && record.unit_price_override.trim()
              ? Number(record.unit_price_override)
              : null,
        manual_label:
          typeof record.manual_label === "string" && record.manual_label.trim() ? record.manual_label.trim() : null,
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        id: string;
        service_addon_id: string | null;
        addon_code: string | null;
        name_ru: string | null;
        name_en: string | null;
        unit_type: string | null;
        quantity: number | null;
        unit_price_override: number | null;
        manual_label: string | null;
      } =>
        Boolean(entry && (entry.service_addon_id || entry.addon_code || entry.manual_label || entry.name_ru || entry.name_en)),
    );

  return normalized.length > 0 ? normalized : null;
}

function normalizeCalculatorDynamicFields(value: unknown) {
  const record = asRecord(value);

  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, entryValue]) => {
      if (
        entryValue === null ||
        typeof entryValue === "string" ||
        typeof entryValue === "number" ||
        typeof entryValue === "boolean"
      ) {
        return [key, entryValue];
      }

      return [key, null];
    }),
  ) as Record<string, string | number | boolean | null>;
}

function normalizeCalculatorCards(value: unknown): CalculatorCard[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index) => {
      const record = asRecord(entry);

      if (!record) {
        return null;
      }

      const pricing = asRecord(record.pricing);
      const addonsSnapshot = normalizeAddonsSnapshot(record.addons);

      const card: CalculatorCard = {
        id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : `card-${index + 1}`,
        service_type_id:
          typeof record.service_type_id === "string" && record.service_type_id.trim() ? record.service_type_id.trim() : null,
        selected_category_code:
          typeof record.selected_category_code === "string" && record.selected_category_code.trim()
            ? record.selected_category_code.trim()
            : null,
        selected_brand_code:
          typeof record.selected_brand_code === "string" && record.selected_brand_code.trim()
            ? record.selected_brand_code.trim()
            : null,
        film_id: typeof record.film_id === "string" && record.film_id.trim() ? record.film_id.trim() : null,
        dynamic_fields: normalizeCalculatorDynamicFields(record.dynamic_fields),
        pricing: {
          service_unit_price_override:
            pricing && typeof pricing.service_unit_price_override === "number"
              ? pricing.service_unit_price_override
              : pricing && typeof pricing.service_unit_price_override === "string" && pricing.service_unit_price_override.trim()
                ? Number(pricing.service_unit_price_override)
                : null,
          block_unit_price_override:
            pricing && typeof pricing.block_unit_price_override === "number"
              ? pricing.block_unit_price_override
              : pricing && typeof pricing.block_unit_price_override === "string" && pricing.block_unit_price_override.trim()
                ? Number(pricing.block_unit_price_override)
                : null,
        },
        addons: (addonsSnapshot ?? []).map((addon) => ({
          id: addon.id,
          service_addon_id: addon.service_addon_id,
          addon_code: addon.addon_code,
          name_ru: addon.name_ru,
          name_en: addon.name_en,
          unit_type: addon.unit_type,
          quantity: addon.quantity,
          unit_price_override: addon.unit_price_override,
          manual_label: addon.manual_label,
        })),
        notes: typeof record.notes === "string" ? record.notes : "",
      };

      return card.service_type_id ? card : null;
    })
    .filter((card): card is CalculatorCard => Boolean(card));
}

function buildCalculatorItemTitles(
  card: CalculatorCard,
  serviceType: { name_ru: string; name_en: string },
  lineIndex: number,
) {
  const roomName = typeof card.dynamic_fields.room_name === "string" && card.dynamic_fields.room_name.trim()
    ? card.dynamic_fields.room_name.trim()
    : null;

  if (roomName) {
    return {
      title_ru: `${roomName} · ${serviceType.name_ru}`,
      title_en: `${roomName} · ${serviceType.name_en}`,
    };
  }

  return {
    title_ru: `${serviceType.name_ru} · расчет ${lineIndex}`,
    title_en: `${serviceType.name_en} · line ${lineIndex}`,
  };
}

function buildCalculatorItemDescription(
  card: CalculatorCard,
  lineAddons: ReturnType<typeof normalizeAddonsSnapshot>,
  film: {
    brand_name_ru: string;
    model_name_ru: string;
    brand_name_en: string;
    model_name_en: string;
    thickness: string | null;
  } | null,
) {
  const notes = card.notes.trim();
  const addonsLabel = lineAddons?.length
    ? lineAddons
        .map((addon) => addon.manual_label ?? addon.name_ru ?? addon.name_en ?? addon.addon_code ?? "addon")
        .join(", ")
    : null;

  return {
    description_ru: [film ? `${film.brand_name_ru} ${film.model_name_ru}` : null, film?.thickness ?? null, addonsLabel ? `Допы: ${addonsLabel}` : null, notes || null]
      .filter((value): value is string => Boolean(value))
      .join(" · "),
    description_en: [film ? `${film.brand_name_en} ${film.model_name_en}` : null, film?.thickness ?? null, notes || null]
      .filter((value): value is string => Boolean(value))
      .join(" · "),
  };
}

async function recalculateProposalTotals(tx: ProposalDbClient, proposalId: string) {
  const items = await tx.proposalItem.findMany({
    where: {
      proposal_id: proposalId,
    },
    select: {
      line_price: true,
      client_selected: true,
    },
  });

  const subtotal = items.reduce((sum, item) => sum + toNumber(item.line_price), 0);
  const selectedTotal = items.reduce(
    (sum, item) => sum + (item.client_selected ? toNumber(item.line_price) : 0),
    0,
  );

  return tx.proposal.update({
    where: {
      proposal_id: proposalId,
    },
    data: {
      subtotal_amount: subtotal,
      selected_total_amount: selectedTotal,
    },
  });
}

function buildProposalItemTitle(
  roomName: string | null | undefined,
  serviceNameRu: string,
  serviceNameEn: string,
) {
  const room = roomName?.trim();

  return {
    title_ru: room ? `${room} · ${serviceNameRu}` : serviceNameRu,
    title_en: room ? `${room} · ${serviceNameEn}` : serviceNameEn,
  };
}

const proposalItemInclude = {
  measurement: {
    select: {
      measurement_id: true,
      room_name: true,
      office_name: true,
      zone_name: true,
      floor: true,
      window_id: true,
      width: true,
      height: true,
      sqft: true,
      quantity: true,
      glass_type: true,
      orientation: true,
      access_type: true,
      notes: true,
    },
  },
  service_type: {
    select: {
      service_type_id: true,
      service_code: true,
      name_ru: true,
      name_en: true,
    },
  },
  film: {
    select: {
      film_id: true,
      category_name_ru: true,
      category_name_en: true,
      brand_name_ru: true,
      brand_name_en: true,
      model_name_ru: true,
      model_name_en: true,
      thickness: true,
    },
  },
} as const;

const proposalInclude = {
  deal: {
    include: {
      pipeline_status: {
        select: {
          status_code: true,
          name_ru: true,
          name_en: true,
          color_token: true,
        },
      },
      assigned_manager: {
        select: {
          user_id: true,
          full_name: true,
          email: true,
        },
      },
    },
  },
  client: {
    select: {
      client_id: true,
      client_code: true,
      name: true,
      phone: true,
      email: true,
      service_address: true,
    },
  },
  survey: {
    select: {
      survey_id: true,
      status: true,
      consultation: {
        select: {
          consultation_id: true,
          title: true,
          scheduled_start_at: true,
        },
      },
    },
  },
  created_by_user: {
    select: {
      user_id: true,
      full_name: true,
      email: true,
    },
  },
  proposal_items: {
    orderBy: {
      sort_order: "asc",
    },
    include: proposalItemInclude,
  },
  proposal_events: {
    orderBy: {
      created_at: "desc",
    },
    include: {
      actor_user: {
        select: {
          user_id: true,
          full_name: true,
        },
      },
    },
  },
  agreement: true,
  deposit: true,
  project: {
    select: {
      project_id: true,
      project_code: true,
      title: true,
      payment_status: {
        select: {
          status_code: true,
          name_ru: true,
        },
      },
      project_status: {
        select: {
          status_code: true,
          name_ru: true,
        },
      },
    },
  },
} as const;

async function createProposalEvent(
  tx: ProposalDbClient,
  input: {
    proposalId: string;
    actorUserId?: string | null;
    actorType: "manager" | "client" | "system";
    eventKey: string;
    message: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  await tx.proposalEvent.create({
    data: {
      proposal_id: input.proposalId,
      actor_user_id: input.actorUserId ?? null,
      actor_type: input.actorType,
      event_key: input.eventKey,
      message: input.message,
      metadata: input.metadata ?? Prisma.JsonNull,
    },
  });
}

async function notifyManager(
  tx: ProposalDbClient,
  input: {
    recipientUserId?: string | null;
    actorUserId?: string | null;
    proposalId: string;
    typeKey: string;
    title: string;
    message: string;
  },
) {
  if (!input.recipientUserId) {
    return;
  }

  await tx.notification.create({
    data: {
      recipient_user_id: input.recipientUserId,
      actor_user_id: input.actorUserId ?? null,
      entity_type: "proposal",
      entity_id: input.proposalId,
      type_key: input.typeKey,
      title: input.title,
      message: input.message,
    },
  });
}

async function updateDealStage(tx: typeof prisma, dealId: string, statusCode: string) {
  const pipelineStatusId = await getPipelineStatusId(statusCode);

  if (!pipelineStatusId) {
    return;
  }

  await tx.deal.update({
    where: {
      deal_id: dealId,
    },
    data: {
      pipeline_status_id: pipelineStatusId,
    },
  });
}

export async function getProposalList(session: SessionLike) {
  const proposals = await prisma.proposal.findMany({
    where: buildProposalWhere(session),
    orderBy: [{ updated_at: "desc" }],
    include: {
      deal: {
        include: {
          pipeline_status: {
            select: {
              status_code: true,
              name_ru: true,
              color_token: true,
            },
          },
        },
      },
      client: {
        select: {
          client_id: true,
          name: true,
          email: true,
        },
      },
      agreement: {
        select: {
          status: true,
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
      _count: {
        select: {
          proposal_items: true,
        },
      },
    },
  });

  return proposals.map(serializeProposalListItem);
}

export async function getSurveyReadyDeals(session: SessionLike) {
  const where = isOwner(session)
    ? {
        pipeline_status: {
          status_code: "SURVEY_COMPLETED",
        },
      }
    : {
        assigned_manager_id: session.user.user_id,
        pipeline_status: {
          status_code: "SURVEY_COMPLETED",
        },
      };

  const deals = await prisma.deal.findMany({
    where,
    orderBy: {
      updated_at: "desc",
    },
    include: {
      client: {
        select: {
          client_id: true,
          name: true,
        },
      },
      consultations: {
        where: {
          survey: {
            status: "completed",
          },
        },
        orderBy: {
          scheduled_start_at: "desc",
        },
        select: {
          consultation_id: true,
          title: true,
          survey: {
            select: {
              survey_id: true,
              status: true,
            },
          },
        },
      },
      _count: {
        select: {
          proposals: true,
        },
      },
    },
  });

  return deals.map((deal) => ({
    deal_id: deal.deal_id,
    deal_code: deal.deal_code,
    title: deal.title,
    client: deal.client,
    proposals_count: deal._count.proposals,
    latest_completed_survey: deal.consultations[0]?.survey
      ? {
          survey_id: deal.consultations[0].survey.survey_id,
          consultation_id: deal.consultations[0].consultation_id,
          title: deal.consultations[0].title,
        }
      : null,
  }));
}

export async function getProposalById(session: SessionLike, proposalId: string) {
  const proposal = await prisma.proposal.findFirst({
    where: buildProposalWhere(session, proposalId),
    include: proposalInclude,
  });

  return proposal ? serializeProposalDetail(proposal) : null;
}

export async function createProposalFromSurvey(
  session: SessionLike,
  input: {
    deal_id: string;
    survey_id?: string | null;
    title?: string | null;
  },
) {
  const deal = await prisma.deal.findFirst({
    where: isOwner(session)
      ? {
          deal_id: input.deal_id,
        }
      : {
          deal_id: input.deal_id,
          assigned_manager_id: session.user.user_id,
        },
    include: {
      client: true,
    },
  });

  const dealClientId = deal?.client_id ?? null;

  if (!deal || !dealClientId || !deal.client) {
    return null;
  }

  const survey = input.survey_id
    ? await prisma.survey.findFirst({
        where: {
          survey_id: input.survey_id,
          consultation: {
            deal_id: deal.deal_id,
          },
        },
        include: {
          measurements: {
            orderBy: {
              sort_order: "asc",
            },
          },
          recommendations: {
            orderBy: [{ is_primary: "desc" }, { sort_order: "asc" }],
            include: {
              measurement: true,
              service_type: true,
              film: true,
            },
          },
        },
      })
    : await prisma.survey.findFirst({
        where: {
          status: "completed",
          consultation: {
            deal_id: deal.deal_id,
          },
        },
        orderBy: {
          completed_at: "desc",
        },
        include: {
          measurements: {
            orderBy: {
              sort_order: "asc",
            },
          },
          recommendations: {
            orderBy: [{ is_primary: "desc" }, { sort_order: "asc" }],
            include: {
              measurement: true,
              service_type: true,
              film: true,
            },
          },
        },
      });

  if (!survey) {
    return null;
  }

  const proposalAddons = await prisma.serviceAddon.findMany({
    where: {
      is_active: true,
      service_type_id: {
        in: survey.recommendations.map((recommendation) => recommendation.service_type_id),
      },
    },
    orderBy: [{ service_type: { sort_order: "asc" } }, { sort_order: "asc" }],
  });

  const optionalServiceTypes = await prisma.serviceType.findMany({
    where: {
      service_code: {
        in: ["WASHING", "REMOVAL", "SILICONE", "ELECTRICAL_WORK"],
      },
    },
  });

  const addonServiceMap = Object.fromEntries(
    optionalServiceTypes.map((item) => [item.service_code, item]),
  ) as Record<string, (typeof optionalServiceTypes)[number] | undefined>;

  const addonsByServiceTypeId = proposalAddons.reduce<Record<string, typeof proposalAddons>>((acc, addon) => {
    if (!acc[addon.service_type_id]) {
      acc[addon.service_type_id] = [];
    }

    acc[addon.service_type_id].push(addon);
    return acc;
  }, {});

  const proposal = await prisma.$transaction(async (tx) => {
    const created = await tx.proposal.create({
      data: {
        proposal_code: `PRP-${Date.now().toString().slice(-6)}`,
        deal_id: deal.deal_id,
        client_id: dealClientId,
        survey_id: survey.survey_id,
        created_by: session.user.user_id,
        title: input.title?.trim() || `${deal.title} Proposal`,
        status: PROPOSAL_STATUSES.DRAFT,
        access_token: makeProposalAccessToken(),
        currency: deal.currency,
        client_message: "Review the proposed services below, keep the items you want, remove what you do not need, and sign the agreement when ready.",
      },
    });

    let sortOrder = 1;

    for (const recommendation of survey.recommendations) {
      const measurement = recommendation.measurement;
      const sqft = toNumber(measurement?.sqft);
      const measurementQuantity = toNumber(measurement?.quantity) || 1;
      const billableSqft = sqft * measurementQuantity;
      const serviceTitle = buildProposalItemTitle(
        measurement?.room_name,
        recommendation.service_type.name_ru,
        recommendation.service_type.name_en,
      );

      await tx.proposalItem.create({
        data: {
          proposal_id: created.proposal_id,
          measurement_id: measurement?.measurement_id ?? null,
          service_type_id: recommendation.service_type_id,
          film_id: recommendation.film_id,
          item_kind: "service",
          room_name: measurement?.room_name ?? null,
          zone_name: measurement?.zone_name ?? null,
          window_id: measurement?.window_id ?? null,
          title_ru: serviceTitle.title_ru,
          title_en: serviceTitle.title_en,
          description_ru: recommendation.film
            ? `${recommendation.film.brand_name_ru} ${recommendation.film.model_name_ru}`
            : recommendation.recommendation_notes,
          description_en: recommendation.film
            ? `${recommendation.film.brand_name_en} ${recommendation.film.model_name_en}`
            : recommendation.recommendation_notes,
          measurement_snapshot: measurement
            ? {
                room_name: measurement.room_name,
                office_name: measurement.office_name,
                zone_name: measurement.zone_name,
                floor: measurement.floor,
                window_id: measurement.window_id,
                width: toNumber(measurement.width),
                height: toNumber(measurement.height),
                sqft,
                quantity: measurementQuantity,
                total_sqft: billableSqft,
                glass_type: measurement.glass_type,
                orientation: measurement.orientation,
                access_type: measurement.access_type,
              }
            : undefined,
          dynamic_fields: {
            sqft: billableSqft,
            windows_qty: measurementQuantity,
            ...(recommendation.film?.thickness ? { thickness: recommendation.film.thickness } : {}),
          },
          addons_snapshot: [],
          quantity: billableSqft || 1,
          unit_label: recommendation.service_type.unit_type,
          line_price: estimateLinePrice(
            recommendation.service_type.service_code,
            billableSqft || 1,
            recommendation.film?.thickness,
          ),
          is_optional: false,
          client_selected: true,
          sort_order: sortOrder++,
        },
      });

      if (
        measurement &&
        recommendation.is_primary &&
        ["SMART_FILM", "SOLAR_FILM", "SAFETY_FILM"].includes(recommendation.service_type.service_code)
      ) {
        const optionalAddons = (addonsByServiceTypeId[recommendation.service_type_id] ?? []).filter(
          (addon) => addon.addon_code !== "OTHER",
        );

        for (const addon of optionalAddons) {
          const addonServiceType =
            addonServiceMap[addon.addon_code === "EXTRA_ELECTRICAL" ? "ELECTRICAL_WORK" : addon.addon_code] ??
            recommendation.service_type;
          const addonQuantity = addon.unit_type === "sqft" ? billableSqft || 0 : 1;
          const addonLinePrice =
            addon.addon_code === "OTHER"
              ? 0
              : addon.unit_type === "fixed"
                ? toNumber(addon.default_price)
                : addonQuantity * toNumber(addon.default_price);

          if (addon.unit_type === "sqft" && addonQuantity <= 0) {
            continue;
          }

          await tx.proposalItem.create({
            data: {
              proposal_id: created.proposal_id,
              measurement_id: measurement.measurement_id,
              service_type_id: addonServiceType.service_type_id,
              item_kind: "addon",
              room_name: measurement.room_name,
              zone_name: measurement.zone_name,
              window_id: measurement.window_id,
              title_ru: `${measurement.room_name} · ${addon.name_ru}`,
              title_en: `${measurement.room_name} · ${addon.name_en}`,
              description_ru: `Опционально для ${recommendation.service_type.name_ru}.`,
              description_en: `Optional add-on for ${recommendation.service_type.name_en}.`,
              measurement_snapshot: {
                room_name: measurement.room_name,
                zone_name: measurement.zone_name,
                window_id: measurement.window_id,
                sqft,
                quantity: measurementQuantity,
                total_sqft: billableSqft,
              },
              dynamic_fields:
                addon.unit_type === "sqft"
                  ? { sqft: billableSqft, windows_qty: measurementQuantity }
                  : Prisma.DbNull,
              addons_snapshot: [
                {
                  id: `proposal-addon-${addon.addon_code.toLowerCase()}`,
                  service_addon_id: addon.service_addon_id,
                  addon_code: addon.addon_code,
                  name_ru: addon.name_ru,
                  name_en: addon.name_en,
                  unit_type: addon.unit_type,
                  quantity: addonQuantity,
                  unit_price_override: toNumber(addon.default_price),
                  manual_label: null,
                },
              ],
              quantity: addonQuantity || 1,
              unit_label: addon.unit_type,
              line_price: addonLinePrice,
              is_optional: true,
              client_selected: false,
              sort_order: sortOrder++,
            },
          });
        }
      }
    }

    await recalculateProposalTotals(tx, created.proposal_id);
    await createProposalEvent(tx, {
      proposalId: created.proposal_id,
      actorUserId: session.user.user_id,
      actorType: "manager",
      eventKey: "proposal.created",
      message: "Proposal создан на основе survey и готов к редактированию.",
      metadata: {
        survey_id: survey.survey_id,
        deal_id: deal.deal_id,
      },
    });

    return created.proposal_id;
  });

  await logSalesActivity({
    actorUserId: session.user.user_id,
    entityType: "proposal",
    entityId: proposal,
    actionKey: "proposal.created",
    message: `Proposal создан для сделки ${deal.title}.`,
    metadata: {
      deal_id: deal.deal_id,
      survey_id: survey.survey_id,
    },
  });

  return getProposalById(session, proposal);
}

export async function createProposalFromCalculator(
  session: SessionLike,
  input: {
    deal_id: string;
    title?: string | null;
    calculator_cards: unknown;
  },
) {
  const deal = await prisma.deal.findFirst({
    where: isOwner(session)
      ? {
          deal_id: input.deal_id,
        }
      : {
          deal_id: input.deal_id,
          assigned_manager_id: session.user.user_id,
        },
    include: {
      client: true,
    },
  });

  const dealClientId = deal?.client_id ?? null;

  if (!deal || !dealClientId || !deal.client) {
    return null;
  }

  const cards = normalizeCalculatorCards(input.calculator_cards);

  if (cards.length === 0) {
    return "empty_calculator" as const;
  }

  const bootstrap = await getServiceCalculatorBootstrap();

  const proposalId = await prisma.$transaction(async (tx) => {
    const created = await tx.proposal.create({
      data: {
        proposal_code: `PRP-${Date.now().toString().slice(-6)}`,
        deal_id: deal.deal_id,
        client_id: dealClientId,
        survey_id: null,
        created_by: session.user.user_id,
        title: input.title?.trim() || `${deal.title} Proposal`,
        status: PROPOSAL_STATUSES.DRAFT,
        access_token: makeProposalAccessToken(),
        currency: deal.currency,
        client_message: "Review the proposed services below, keep the items you want, remove what you do not need, and sign the agreement when ready.",
      },
    });

    let sortOrder = 1;

    for (const [index, card] of cards.entries()) {
      const serviceType = getServiceTypeById(bootstrap.service_types, card.service_type_id);

      if (!serviceType) {
        continue;
      }

      const film =
        card.film_id
          ? await tx.filmCatalog.findUnique({
              where: {
                film_id: card.film_id,
              },
              select: {
                film_id: true,
                brand_name_ru: true,
                model_name_ru: true,
                brand_name_en: true,
                model_name_en: true,
                thickness: true,
              },
            })
          : null;

      const normalizedAddons = normalizeAddonsSnapshot(card.addons) ?? [];
      const line = calculateLineTotal(card, bootstrap);
      const economics = calculateLineEconomics(card, bootstrap);
      const titles = buildCalculatorItemTitles(card, serviceType, index + 1);
      const descriptions = buildCalculatorItemDescription(card, normalizedAddons, film);
      const quantity =
        Math.max(
          1,
          toNumber(card.dynamic_fields.sqft as string | number | null) ||
            toNumber(card.dynamic_fields.windows_qty as string | number | null) ||
            toNumber(card.dynamic_fields.blocks_qty as string | number | null),
        ) || 1;

      await tx.proposalItem.create({
        data: {
          proposal_id: created.proposal_id,
          measurement_id: null,
          service_type_id: serviceType.service_type_id,
          film_id: card.film_id,
          item_kind: "service",
          room_name:
            typeof card.dynamic_fields.room_name === "string" && card.dynamic_fields.room_name.trim()
              ? card.dynamic_fields.room_name.trim()
              : null,
          zone_name: null,
          window_id: null,
          title_ru: titles.title_ru,
          title_en: titles.title_en,
          description_ru: descriptions.description_ru || serviceType.name_ru,
          description_en: descriptions.description_en || serviceType.name_en,
          measurement_snapshot: Prisma.DbNull,
          dynamic_fields: {
            ...card.dynamic_fields,
            pricing: {
              service_unit_price_override: card.pricing.service_unit_price_override,
              block_unit_price_override: card.pricing.block_unit_price_override,
            },
            calculator_notes: card.notes || null,
            calculation_breakdown: line.breakdown,
            economics_snapshot: economics,
          } as Prisma.InputJsonValue,
          addons_snapshot: normalizedAddons as Prisma.InputJsonValue,
          quantity,
          unit_label: serviceType.unit_type,
          line_price: line.line_total,
          is_optional: false,
          client_selected: true,
          sort_order: sortOrder++,
        },
      });
    }

    await recalculateProposalTotals(tx, created.proposal_id);
    await createProposalEvent(tx, {
      proposalId: created.proposal_id,
      actorUserId: session.user.user_id,
      actorType: "manager",
      eventKey: "proposal.created",
      message: "Proposal создан из calculator и привязан к сделке.",
      metadata: {
        deal_id: deal.deal_id,
        source: "calculator",
      },
    });

    return created.proposal_id;
  });

  await logSalesActivity({
    actorUserId: session.user.user_id,
    entityType: "proposal",
    entityId: proposalId,
    actionKey: "proposal.created",
    message: `Proposal создан из calculator для сделки ${deal.title}.`,
    metadata: {
      deal_id: deal.deal_id,
      source: "calculator",
    },
  });

  return getProposalById(session, proposalId);
}

export async function updateProposal(
  session: SessionLike,
  proposalId: string,
  input: {
    title?: string;
    client_message?: string | null;
    notes?: string | null;
    expires_at?: string | null;
  },
) {
  const proposal = await prisma.proposal.findFirst({
    where: buildProposalWhere(session, proposalId),
    select: {
      proposal_id: true,
      status: true,
    },
  });

  if (!proposal) {
    return null;
  }

  if (isProposalApproved(proposal.status)) {
    return "locked" as const;
  }

  await prisma.proposal.update({
    where: {
      proposal_id: proposalId,
    },
    data: {
      title: input.title?.trim() || undefined,
      client_message: input.client_message !== undefined ? input.client_message?.trim() || null : undefined,
      notes: input.notes !== undefined ? input.notes?.trim() || null : undefined,
      expires_at: input.expires_at !== undefined ? (input.expires_at ? new Date(input.expires_at) : null) : undefined,
    },
  });

  return getProposalById(session, proposalId);
}

export async function addProposalItem(
  session: SessionLike,
  proposalId: string,
  input: {
    measurement_id?: string | null;
    service_type_id: string;
    film_id?: string | null;
    room_name?: string | null;
    zone_name?: string | null;
    window_id?: string | null;
    title_ru: string;
    title_en: string;
    description_ru?: string | null;
    description_en?: string | null;
    dynamic_fields?: Record<string, string | number | boolean | null> | null;
    addons_snapshot?: unknown[] | null;
    quantity?: number;
    unit_label?: string | null;
    line_price: number;
    is_optional?: boolean;
    client_selected?: boolean;
  },
) {
  const proposal = await prisma.proposal.findFirst({
    where: buildProposalWhere(session, proposalId),
    include: {
      proposal_items: {
        orderBy: {
          sort_order: "desc",
        },
        take: 1,
      },
    },
  });

  if (!proposal) {
    return null;
  }

  if (isProposalApproved(proposal.status)) {
    return "locked" as const;
  }

  await prisma.$transaction(async (tx) => {
    await tx.proposalItem.create({
      data: {
        proposal_id: proposalId,
        measurement_id: input.measurement_id ?? null,
        service_type_id: input.service_type_id,
        film_id: input.film_id ?? null,
        room_name: input.room_name?.trim() || null,
        zone_name: input.zone_name?.trim() || null,
        window_id: input.window_id?.trim() || null,
        title_ru: input.title_ru.trim(),
        title_en: input.title_en.trim(),
        description_ru: input.description_ru?.trim() || null,
        description_en: input.description_en?.trim() || null,
        dynamic_fields: jsonOrDbNull(normalizeDynamicFields(input.dynamic_fields)),
        addons_snapshot: jsonOrDbNull(normalizeAddonsSnapshot(input.addons_snapshot) as Prisma.InputJsonValue | null),
        quantity: input.quantity ?? 1,
        unit_label: input.unit_label?.trim() || null,
        line_price: input.line_price,
        is_optional: input.is_optional ?? false,
        client_selected:
          input.client_selected ?? (input.is_optional ? false : true),
        sort_order: (proposal.proposal_items[0]?.sort_order ?? 0) + 1,
      },
    });

    await recalculateProposalTotals(tx, proposalId);
    await createProposalEvent(tx, {
      proposalId,
      actorUserId: session.user.user_id,
      actorType: "manager",
      eventKey: "proposal.item_added",
      message: "Менеджер добавил новую строку в proposal.",
    });
  });

  await logSalesActivity({
    actorUserId: session.user.user_id,
    entityType: "proposal",
    entityId: proposalId,
    actionKey: "proposal.item_added",
    message: "В proposal добавлена новая строка.",
  });

  return getProposalById(session, proposalId);
}

export async function updateProposalItem(
  session: SessionLike,
  itemId: string,
  input: {
    service_type_id?: string;
    film_id?: string | null;
    room_name?: string | null;
    zone_name?: string | null;
    window_id?: string | null;
    title_ru?: string;
    title_en?: string;
    description_ru?: string | null;
    description_en?: string | null;
    dynamic_fields?: Record<string, string | number | boolean | null> | null;
    addons_snapshot?: unknown[] | null;
    quantity?: number;
    unit_label?: string | null;
    line_price?: number;
    is_optional?: boolean;
    client_selected?: boolean;
  },
) {
  const item = await prisma.proposalItem.findFirst({
    where: {
      proposal_item_id: itemId,
      proposal: buildProposalWhere(session),
    },
    select: {
      proposal_id: true,
      proposal: {
        select: {
          status: true,
        },
      },
    },
  });

  if (!item) {
    return null;
  }

  if (isProposalApproved(item.proposal.status)) {
    return "locked" as const;
  }

  await prisma.$transaction(async (tx) => {
    await tx.proposalItem.update({
      where: {
        proposal_item_id: itemId,
      },
      data: {
        service_type_id: input.service_type_id ?? undefined,
        film_id: input.film_id !== undefined ? input.film_id : undefined,
        room_name: input.room_name !== undefined ? input.room_name?.trim() || null : undefined,
        zone_name: input.zone_name !== undefined ? input.zone_name?.trim() || null : undefined,
        window_id: input.window_id !== undefined ? input.window_id?.trim() || null : undefined,
        title_ru: input.title_ru?.trim(),
        title_en: input.title_en?.trim(),
        description_ru: input.description_ru !== undefined ? input.description_ru?.trim() || null : undefined,
        description_en: input.description_en !== undefined ? input.description_en?.trim() || null : undefined,
        dynamic_fields:
          input.dynamic_fields !== undefined
            ? jsonOrUndefined(normalizeDynamicFields(input.dynamic_fields))
            : undefined,
        addons_snapshot:
          input.addons_snapshot !== undefined
            ? jsonOrUndefined(normalizeAddonsSnapshot(input.addons_snapshot) as Prisma.InputJsonValue | null)
            : undefined,
        quantity: input.quantity ?? undefined,
        unit_label: input.unit_label !== undefined ? input.unit_label?.trim() || null : undefined,
        line_price: input.line_price ?? undefined,
        is_optional: input.is_optional ?? undefined,
        client_selected:
          input.client_selected !== undefined
            ? input.client_selected
            : input.is_optional !== undefined
              ? !input.is_optional
              : undefined,
      },
    });

    await recalculateProposalTotals(tx, item.proposal_id);
  });

  return getProposalById(session, item.proposal_id);
}

export async function sendProposal(session: SessionLike, proposalId: string) {
  const proposal = await prisma.proposal.findFirst({
    where: buildProposalWhere(session, proposalId),
    include: {
      deal: {
        select: {
          deal_id: true,
          title: true,
          lead_id: true,
          assigned_manager_id: true,
        },
      },
    },
  });

  if (!proposal) {
    return null;
  }

  if (isProposalApproved(proposal.status)) {
    return "locked" as const;
  }

  await prisma.$transaction(async (tx) => {
    await tx.proposal.update({
      where: {
        proposal_id: proposalId,
      },
      data: {
        status: PROPOSAL_STATUSES.SENT,
        sent_at: proposal.sent_at ?? new Date(),
      },
    });

    await onProposalSent(tx, {
      actorUserId: session.user.user_id,
      proposalId,
      leadId: proposal.deal.lead_id ?? null,
      dealId: proposal.deal_id,
      managerUserId: proposal.deal.assigned_manager_id ?? null,
    });
    await createProposalEvent(tx, {
      proposalId,
      actorUserId: session.user.user_id,
      actorType: "manager",
      eventKey: "proposal.sent",
      message: "Proposal отправлен клиенту для выбора услуг и подписания agreement.",
    });
  });

  await logSalesActivity({
    actorUserId: session.user.user_id,
    entityType: "proposal",
    entityId: proposalId,
    actionKey: "proposal.sent",
    message: `Proposal отправлен клиенту по сделке ${proposal.deal.title}.`,
    metadata: {
      deal_id: proposal.deal_id,
    },
  });

  return getProposalById(session, proposalId);
}

function serializeDepositRecord(deposit: {
  deposit_id: string;
  proposal_id: string;
  amount: { toString(): string };
  status: string;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    deposit_id: deposit.deposit_id,
    proposal_id: deposit.proposal_id,
    amount: toNumber(deposit.amount),
    status: deposit.status,
    paid_at: deposit.paid_at,
    created_at: deposit.created_at,
    updated_at: deposit.updated_at,
  };
}

export async function approveProposal(session: SessionLike, proposalId: string) {
  const proposal = await prisma.proposal.findFirst({
    where: buildProposalWhere(session, proposalId),
    select: {
      proposal_id: true,
      deal_id: true,
      title: true,
      status: true,
      selected_total_amount: true,
      deal: {
        select: {
          lead_id: true,
          assigned_manager_id: true,
        },
      },
      project: {
        select: {
          project_id: true,
        },
      },
    },
  });

  if (!proposal) {
    return null;
  }

  if (proposal.project?.project_id || isProposalApproved(proposal.status)) {
    return getProposalById(session, proposalId);
  }

  if (toNumber(proposal.selected_total_amount) <= 0) {
    return "missing_selection" as const;
  }

  await prisma.$transaction(async (tx) => {
    await tx.proposal.update({
      where: {
        proposal_id: proposalId,
      },
      data: {
        status: PROPOSAL_STATUSES.APPROVED,
      },
    });

    await onProposalApproved(tx, {
      actorUserId: session.user.user_id,
      proposalId,
      leadId: proposal.deal?.lead_id ?? null,
      dealId: proposal.deal_id,
      managerUserId: proposal.deal?.assigned_manager_id ?? null,
    });
    await createProposalEvent(tx, {
      proposalId,
      actorUserId: session.user.user_id,
      actorType: "manager",
      eventKey: "proposal.approved",
      message: "Менеджер зафиксировал выбранные клиентом позиции и перевел proposal в deposit-ready состояние.",
      metadata: {
        selected_total_amount: toNumber(proposal.selected_total_amount),
      },
    });
  });

  await logSalesActivity({
    actorUserId: session.user.user_id,
    entityType: "proposal",
    entityId: proposalId,
    actionKey: "proposal.approved",
    message: `Proposal ${proposal.title} approved и готов к deposit.`,
    metadata: {
      deal_id: proposal.deal_id,
    },
  });

  return getProposalById(session, proposalId);
}

export async function createDepositForProposal(
  session: SessionLike,
  input: {
    proposal_id: string;
    amount?: number | null;
  },
) {
  const proposal = await prisma.proposal.findFirst({
    where: buildProposalWhere(session, input.proposal_id),
    include: {
      deposit: true,
      deal: {
        select: {
          deal_id: true,
        },
      },
    },
  });

  if (!proposal) {
    return null;
  }

  if (!isProposalApproved(proposal.status)) {
    return "proposal_not_approved" as const;
  }

  const requestedAmount = input.amount ?? toNumber(proposal.selected_total_amount);

  if (requestedAmount <= 0) {
    return "invalid_amount" as const;
  }

  if (proposal.deposit) {
    return {
      deposit: serializeDepositRecord(proposal.deposit),
      proposal: await getProposalById(session, proposal.proposal_id),
    };
  }

  const deposit = await prisma.$transaction(async (tx) => {
    const created = await tx.deposit.create({
      data: {
        proposal_id: proposal.proposal_id,
        amount: requestedAmount,
        status: DEPOSIT_STATUSES.PENDING,
      },
    });

    await createProposalEvent(tx, {
      proposalId: proposal.proposal_id,
      actorUserId: session.user.user_id,
      actorType: "manager",
      eventKey: "deposit.created",
      message: "Для approved proposal создан deposit.",
      metadata: {
        deposit_id: created.deposit_id,
        amount: requestedAmount,
      },
    });

    return created;
  });

  await logSalesActivity({
    actorUserId: session.user.user_id,
    entityType: "proposal",
    entityId: proposal.proposal_id,
    actionKey: "deposit.created",
    message: `Создан deposit для proposal ${proposal.title}.`,
    metadata: {
      deal_id: proposal.deal_id,
      deposit_id: deposit.deposit_id,
      amount: requestedAmount,
    },
  });

  return {
    deposit: serializeDepositRecord(deposit),
    proposal: await getProposalById(session, proposal.proposal_id),
  };
}

export async function markDepositPaid(session: SessionLike, depositId: string) {
  const deposit = await prisma.deposit.findFirst({
    where: {
      deposit_id: depositId,
      proposal: buildProposalWhere(session),
    },
    include: {
      proposal: {
        select: {
          proposal_id: true,
          deal_id: true,
          title: true,
          status: true,
          deal: {
            select: {
              lead_id: true,
              assigned_manager_id: true,
            },
          },
        },
      },
    },
  });

  if (!deposit) {
    return null;
  }

  if (!isProposalApproved(deposit.proposal.status)) {
    return "proposal_not_approved" as const;
  }

  if (deposit.status === DEPOSIT_STATUSES.PAID) {
    return {
      deposit: serializeDepositRecord(deposit),
      proposal: await getProposalById(session, deposit.proposal.proposal_id),
    };
  }

  const paid = await prisma.$transaction(async (tx) => {
    const updated = await tx.deposit.update({
      where: {
        deposit_id: depositId,
      },
      data: {
        status: DEPOSIT_STATUSES.PAID,
        paid_at: new Date(),
      },
    });

    await onDepositPaid(tx, {
      actorUserId: session.user.user_id,
      proposalId: deposit.proposal.proposal_id,
      depositId,
      leadId: deposit.proposal.deal?.lead_id ?? null,
      dealId: deposit.proposal.deal_id,
      managerUserId: deposit.proposal.deal?.assigned_manager_id ?? null,
    });
    await createProposalEvent(tx, {
      proposalId: deposit.proposal.proposal_id,
      actorUserId: session.user.user_id,
      actorType: "manager",
      eventKey: "deposit.paid",
      message: "Deposit отмечен как оплаченный. Proposal готов к созданию проекта.",
      metadata: {
        deposit_id: updated.deposit_id,
        amount: toNumber(updated.amount),
      },
    });

    return updated;
  });

  await logSalesActivity({
    actorUserId: session.user.user_id,
    entityType: "proposal",
    entityId: deposit.proposal.proposal_id,
    actionKey: "deposit.paid",
    message: `Deposit по proposal ${deposit.proposal.title} отмечен как paid.`,
    metadata: {
      deal_id: deposit.proposal.deal_id,
      deposit_id: paid.deposit_id,
      amount: toNumber(paid.amount),
    },
  });

  return {
    deposit: serializeDepositRecord(paid),
    proposal: await getProposalById(session, deposit.proposal.proposal_id),
  };
}

export async function getPublicProposal(accessToken: string) {
  const existing = await prisma.proposal.findUnique({
    where: {
      access_token: accessToken,
    },
    include: proposalInclude,
  });

  if (!existing) {
    return null;
  }

  let proposal = existing;

  if (!existing.client_viewed_at) {
    proposal = await prisma.$transaction(async (tx) => {
      const viewed = await tx.proposal.update({
        where: {
          proposal_id: existing.proposal_id,
        },
        data: {
          client_viewed_at: new Date(),
        },
        include: proposalInclude,
      });

      await createProposalEvent(tx, {
        proposalId: existing.proposal_id,
        actorType: "client",
        eventKey: "proposal.viewed",
        message: "Client opened the proposal page.",
      });

      return viewed;
    });
  }

  return serializePublicProposal(proposal);
}

export async function updatePublicProposalSelections(
  accessToken: string,
  input: {
    items: Array<{
      proposal_item_id: string;
      client_selected: boolean;
    }>;
    client_message?: string | null;
  },
) {
  const proposal = await prisma.proposal.findUnique({
    where: {
      access_token: accessToken,
    },
    include: {
      deal: {
        select: {
          deal_id: true,
          title: true,
          assigned_manager_id: true,
        },
      },
    },
  });

  if (!proposal) {
    return null;
  }

  if (isProposalPublicLocked(proposal.status)) {
    return "locked" as const;
  }

  await prisma.$transaction(async (tx) => {
    for (const item of input.items) {
      await tx.proposalItem.updateMany({
        where: {
          proposal_item_id: item.proposal_item_id,
          proposal_id: proposal.proposal_id,
        },
        data: {
          client_selected: item.client_selected,
          selection_updated_at: new Date(),
        },
      });
    }

    await tx.proposal.update({
      where: {
        proposal_id: proposal.proposal_id,
      },
      data: {
        status: PROPOSAL_STATUSES.CLIENT_UPDATED,
        client_message: input.client_message !== undefined ? input.client_message?.trim() || null : undefined,
        client_updated_at: new Date(),
      },
    });

    await recalculateProposalTotals(tx, proposal.proposal_id);
    await createProposalEvent(tx, {
      proposalId: proposal.proposal_id,
      actorType: "client",
      eventKey: "proposal.client_updated",
      message: "Client updated the selected services in the proposal.",
      metadata: {
        selected_items: input.items.filter((item) => item.client_selected).length,
      },
    });
    await notifyManager(tx, {
      recipientUserId: proposal.deal.assigned_manager_id,
      proposalId: proposal.proposal_id,
      typeKey: "proposal.client_updated",
      title: "Client updated proposal",
      message: `Клиент обновил выбор услуг по proposal ${proposal.title}.`,
    });
  });

  await logSalesActivity({
    entityType: "proposal",
    entityId: proposal.proposal_id,
    actionKey: "proposal.client_updated",
    message: `Клиент обновил выбранные услуги по proposal ${proposal.title}.`,
    metadata: {
      deal_id: proposal.deal.deal_id,
    },
  });

  return getPublicProposal(accessToken);
}

export async function signPublicAgreement(
  accessToken: string,
  input: {
    signer_name: string;
    signer_email: string;
    signer_title?: string | null;
    signature_text: string;
    client_notes?: string | null;
    accepted_terms: boolean;
  },
) {
  const proposal = await prisma.proposal.findUnique({
    where: {
      access_token: accessToken,
    },
    include: {
      deal: {
        select: {
          deal_id: true,
          assigned_manager_id: true,
        },
      },
    },
  });

  if (!proposal) {
    return null;
  }

  if (!input.accepted_terms) {
    return "terms_required" as const;
  }

  if (isProposalApproved(proposal.status)) {
    return "locked" as const;
  }

  await prisma.$transaction(async (tx) => {
    await tx.agreement.upsert({
      where: {
        proposal_id: proposal.proposal_id,
      },
      update: {
        status: AGREEMENT_STATUSES.SIGNED,
        signer_name: input.signer_name.trim(),
        signer_email: input.signer_email.trim().toLowerCase(),
        signer_title: input.signer_title?.trim() || null,
        signature_text: input.signature_text.trim(),
        client_notes: input.client_notes?.trim() || null,
        accepted_terms: true,
        signed_at: new Date(),
      },
      create: {
        proposal_id: proposal.proposal_id,
        status: AGREEMENT_STATUSES.SIGNED,
        signer_name: input.signer_name.trim(),
        signer_email: input.signer_email.trim().toLowerCase(),
        signer_title: input.signer_title?.trim() || null,
        signature_text: input.signature_text.trim(),
        client_notes: input.client_notes?.trim() || null,
        accepted_terms: true,
        signed_at: new Date(),
      },
    });

    await tx.proposal.update({
      where: {
        proposal_id: proposal.proposal_id,
      },
      data: {
        status: PROPOSAL_STATUSES.AGREEMENT_SIGNED,
        client_updated_at: new Date(),
      },
    });

    await recalculateProposalTotals(tx, proposal.proposal_id);
    await createProposalEvent(tx, {
      proposalId: proposal.proposal_id,
      actorType: "client",
      eventKey: "agreement.signed",
      message: "Client signed the agreement.",
      metadata: {
        signer_name: input.signer_name.trim(),
        signer_email: input.signer_email.trim().toLowerCase(),
      },
    });
    await notifyManager(tx, {
      recipientUserId: proposal.deal.assigned_manager_id,
      proposalId: proposal.proposal_id,
      typeKey: "agreement.signed",
      title: "Agreement signed",
      message: `Клиент подписал agreement по proposal ${proposal.title}.`,
    });
  });

  await logSalesActivity({
    entityType: "proposal",
    entityId: proposal.proposal_id,
    actionKey: "agreement.signed",
    message: `Клиент подписал agreement по proposal ${proposal.title}.`,
    metadata: {
      deal_id: proposal.deal.deal_id,
    },
  });

  return getPublicProposal(accessToken);
}
