import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

export const COMPENSATION_PAY_TYPES = [
  "NONE",
  "SALARY",
  "HOURLY",
  "COMMISSION",
  "PIECEWORK",
  "FIXED_PER_JOB",
] as const;

export type CompensationPayType = (typeof COMPENSATION_PAY_TYPES)[number];

export type PieceRateInput = {
  serviceTypeId?: string | null;
  serviceAddonId?: string | null;
  personalRate?: number | null;
  isEnabled?: boolean;
};

export type CompensationInput = {
  payType: CompensationPayType;
  monthlySalary?: number | null;
  hourlyRate?: number | null;
  commissionPercent?: number | null;
  fixedPerJob?: number | null;
  notes?: string | null;
  pieceRates?: PieceRateInput[];
};

const DIRECTION_CODES = ["SMART_FILM", "SOLAR_FILM", "SAFETY_FILM", "DECORATIVE_FILM"] as const;
const LABOR_ADDON_CODES = ["WASHING", "REMOVAL", "SILICONE", "EXTRA_ELECTRICAL", "ANCHORING", "OTHER"] as const;

type CompensationPlanRecord = Prisma.EmployeeCompensationPlanGetPayload<{
  include: {
    piece_rates: {
      include: {
        service_type: true;
        service_addon: { include: { service_type: true } };
      };
    };
  };
}>;

function numberValue(value: Prisma.Decimal | number | string | null | undefined) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(typeof value === "object" ? value.toString() : value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nonnegative(value: number | null | undefined, label: string) {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`${label}: укажите число не меньше нуля.`);
  }
  return Number(normalized.toFixed(2));
}

export function normalizeCompensationInput(input: CompensationInput) {
  if (!COMPENSATION_PAY_TYPES.includes(input.payType)) {
    throw new Error("Выберите корректный тип оплаты.");
  }

  const monthlySalary = nonnegative(input.monthlySalary, "Оклад");
  const hourlyRate = nonnegative(input.hourlyRate, "Ставка за час");
  const commissionPercent = nonnegative(input.commissionPercent, "Комиссия");
  const fixedPerJob = nonnegative(input.fixedPerJob, "Ставка за работу");
  if (commissionPercent > 100) throw new Error("Комиссия не может быть больше 100%.");

  const rates = (input.pieceRates ?? []).filter((rate) => rate.isEnabled !== false);
  const seen = new Set<string>();
  const pieceRates = rates.map((rate) => {
    const serviceTypeId = rate.serviceTypeId?.trim() || null;
    const serviceAddonId = rate.serviceAddonId?.trim() || null;
    if (Boolean(serviceTypeId) === Boolean(serviceAddonId)) {
      throw new Error("У каждой сдельной ставки должна быть выбрана ровно одна услуга.");
    }
    const key = serviceTypeId ? `service:${serviceTypeId}` : `addon:${serviceAddonId}`;
    if (seen.has(key)) throw new Error("Одна услуга не может повторяться в условиях оплаты.");
    seen.add(key);
    return {
      serviceTypeId,
      serviceAddonId,
      personalRate:
        rate.personalRate === null || rate.personalRate === undefined
          ? null
          : nonnegative(rate.personalRate, "Персональная ставка"),
      isEnabled: true,
    };
  });

  if (input.payType === "SALARY" && monthlySalary <= 0) throw new Error("Для оклада укажите сумму в месяц.");
  if (input.payType === "HOURLY" && hourlyRate <= 0) throw new Error("Для почасовой оплаты укажите ставку за час.");
  if (input.payType === "COMMISSION" && commissionPercent <= 0) throw new Error("Для комиссии укажите процент.");
  if (input.payType === "FIXED_PER_JOB" && fixedPerJob <= 0) throw new Error("Для оплаты за работу укажите сумму.");
  if (input.payType === "PIECEWORK" && pieceRates.length === 0) {
    throw new Error("Для сдельной оплаты выберите хотя бы одно направление или услугу.");
  }

  return {
    payType: input.payType,
    monthlySalary,
    hourlyRate,
    commissionPercent: Number(commissionPercent.toFixed(4)),
    fixedPerJob,
    notes: input.notes?.trim() || null,
    pieceRates: input.payType === "PIECEWORK" ? pieceRates : [],
  };
}

export function serializeCompensation(plan: CompensationPlanRecord | null | undefined) {
  if (!plan) {
    return {
      payType: "NONE" as CompensationPayType,
      monthlySalary: 0,
      hourlyRate: 0,
      commissionPercent: 0,
      fixedPerJob: 0,
      notes: null,
      pieceRates: [],
    };
  }

  return {
    payType: plan.pay_type as CompensationPayType,
    monthlySalary: numberValue(plan.monthly_salary),
    hourlyRate: numberValue(plan.hourly_rate),
    commissionPercent: numberValue(plan.commission_percent),
    fixedPerJob: numberValue(plan.fixed_per_job),
    notes: plan.notes,
    pieceRates: plan.piece_rates.map((rate) => ({
      serviceTypeId: rate.service_type_id,
      serviceAddonId: rate.service_addon_id,
      serviceCode: rate.service_type?.service_code ?? rate.service_addon?.service_type.service_code ?? null,
      serviceAddonCode: rate.service_addon?.addon_code ?? null,
      unitType: rate.service_type?.unit_type ?? rate.service_addon?.unit_type ?? "fixed",
      companyDefaultRate: rate.service_type
        ? numberValue(rate.service_type.installation_cost_per_sqft)
        : numberValue(rate.service_addon?.cost_price),
      personalRate: rate.personal_rate === null ? null : numberValue(rate.personal_rate),
      isEnabled: rate.is_enabled,
    })),
  };
}

export async function listCompensationRateCatalog() {
  const directions = await prisma.serviceType.findMany({
    where: { service_code: { in: [...DIRECTION_CODES] }, is_active: true },
    include: {
      service_addons: {
        where: { is_active: true, addon_code: { in: [...LABOR_ADDON_CODES] } },
        orderBy: [{ sort_order: "asc" }, { name_ru: "asc" }],
      },
    },
    orderBy: { sort_order: "asc" },
  });

  return directions.map((direction) => ({
    directionCode: direction.service_code,
    directionName: direction.name_ru,
    serviceTypeId: direction.service_type_id,
    unitType: direction.unit_type,
    companyDefaultRate: numberValue(direction.installation_cost_per_sqft),
    addons: direction.service_addons.map((addon) => ({
      serviceAddonId: addon.service_addon_id,
      name: addon.name_ru,
      unitType: addon.unit_type,
      companyDefaultRate: numberValue(addon.cost_price),
    })),
  }));
}

export async function saveCompensationPlan(
  tx: Prisma.TransactionClient,
  userId: string,
  rawInput: CompensationInput,
) {
  const input = normalizeCompensationInput(rawInput);
  const serviceTypeIds = input.pieceRates.flatMap((rate) => (rate.serviceTypeId ? [rate.serviceTypeId] : []));
  const serviceAddonIds = input.pieceRates.flatMap((rate) => (rate.serviceAddonId ? [rate.serviceAddonId] : []));

  const [serviceTypeCount, serviceAddonCount] = await Promise.all([
    tx.serviceType.count({
      where: { service_type_id: { in: serviceTypeIds }, service_code: { in: [...DIRECTION_CODES] }, is_active: true },
    }),
    tx.serviceAddon.count({
      where: {
        service_addon_id: { in: serviceAddonIds },
        is_active: true,
        service_type: { service_code: { in: [...DIRECTION_CODES] }, is_active: true },
      },
    }),
  ]);
  if (serviceTypeCount !== serviceTypeIds.length || serviceAddonCount !== serviceAddonIds.length) {
    throw new Error("Одна из выбранных услуг больше не активна. Обновите карточку сотрудника.");
  }

  const plan = await tx.employeeCompensationPlan.upsert({
    where: { user_id: userId },
    create: {
      user_id: userId,
      pay_type: input.payType,
      monthly_salary: input.monthlySalary,
      hourly_rate: input.hourlyRate,
      commission_percent: input.commissionPercent,
      fixed_per_job: input.fixedPerJob,
      notes: input.notes,
    },
    update: {
      pay_type: input.payType,
      monthly_salary: input.monthlySalary,
      hourly_rate: input.hourlyRate,
      commission_percent: input.commissionPercent,
      fixed_per_job: input.fixedPerJob,
      notes: input.notes,
      effective_from: new Date(),
    },
  });

  await tx.employeePieceRate.deleteMany({ where: { compensation_plan_id: plan.compensation_plan_id } });
  if (input.pieceRates.length) {
    await tx.employeePieceRate.createMany({
      data: input.pieceRates.map((rate) => ({
        compensation_plan_id: plan.compensation_plan_id,
        service_type_id: rate.serviceTypeId,
        service_addon_id: rate.serviceAddonId,
        personal_rate: rate.personalRate,
        is_enabled: true,
      })),
    });
  }

  return plan;
}

export type CompensationRateSource = "EMPLOYEE_OVERRIDE" | "COMPANY_DEFAULT" | "NOT_ASSIGNED";

/** Resolves the employee's rate without exposing compensation data to the browser. */
export async function resolveEmployeePieceRate(
  tx: Prisma.TransactionClient,
  userId: string,
  target: { serviceTypeId?: string | null; serviceAddonId?: string | null; companyDefaultRate: number },
): Promise<{ rate: number; source: CompensationRateSource }> {
  const plan = await tx.employeeCompensationPlan.findUnique({
    where: { user_id: userId },
    include: {
      piece_rates: {
        where: target.serviceTypeId
          ? { service_type_id: target.serviceTypeId, is_enabled: true }
          : { service_addon_id: target.serviceAddonId ?? undefined, is_enabled: true },
      },
    },
  });
  if (!plan) return { rate: Math.max(0, target.companyDefaultRate), source: "COMPANY_DEFAULT" };
  if (plan.pay_type !== "PIECEWORK") return { rate: 0, source: "NOT_ASSIGNED" };
  const selected = plan.piece_rates[0];
  if (!selected) return { rate: 0, source: "NOT_ASSIGNED" };
  if (selected.personal_rate !== null) {
    return { rate: numberValue(selected.personal_rate), source: "EMPLOYEE_OVERRIDE" };
  }
  return { rate: Math.max(0, target.companyDefaultRate), source: "COMPANY_DEFAULT" };
}
