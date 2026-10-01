import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

type InstallerSession = {
  user: { user_id: string };
  roles: string[];
};

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  if (value === null || value === undefined) return 0;
  const number = Number(typeof value === "object" ? value.toString() : value);
  return Number.isFinite(number) ? number : 0;
}

function jsonNumber(value: Prisma.JsonValue | null | undefined, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  return toNumber((value as Record<string, unknown>)[key] as number | string | null | undefined);
}

/** Team lead earns this % of each group installer's pay, on top (owner decision 2026-09-30). */
export const INSTALLER_LEAD_OVERRIDE_PCT = 10;

/** Owner pay rules (decided 2026-09-30) apply to work accrued from this date. */
export const OWNER_PAY_RULES_FROM = new Date("2026-09-01T00:00:00Z");

/**
 * Installer pay = (film sq ft × rate + Smart zones × zone rate) × difficulty.
 * The difficulty coefficient multiplies all installer labor on the deal.
 */
export function calculatePayrollAmount(
  quantitySqft: number,
  ratePerSqft: number,
  complexityMultiplier: number,
  zoneCount = 0,
  zoneRate = 0,
) {
  const labor = Math.max(0, quantitySqft) * Math.max(0, ratePerSqft) + Math.max(0, zoneCount) * Math.max(0, zoneRate);
  return Number((labor * Math.max(1, complexityMultiplier)).toFixed(2));
}

/**
 * Installer pay per Smart zone: the employee's own connection rate (legacy
 * card payConfig.ratesByWorkType.connect) if set, else the rate directory
 * (ZONE_CONNECTION) — the same order the CRM uses for profitability.
 */
async function installerZoneRate(tx: Prisma.TransactionClient, installerId: string) {
  const [user, workspace, service] = await Promise.all([
    tx.user.findUnique({ where: { user_id: installerId }, select: { legacy_user_ids: true } }),
    tx.legacyWorkspace.findUnique({ where: { workspace_id: "primary" }, select: { payload: true } }),
    tx.serviceType.findUnique({ where: { service_code: "ZONE_CONNECTION" }, select: { installation_cost_per_sqft: true } }),
  ]);
  const cards = ((workspace?.payload as { users?: unknown } | null)?.users ?? []) as Array<Record<string, unknown>>;
  const ownCards = Array.isArray(cards)
    ? cards.filter((candidate) => (user?.legacy_user_ids ?? []).includes(String(candidate?.id ?? "")))
    : [];
  // Multi-role employees: the connection rate lives on the installer card.
  const card = ownCards.find((candidate) => candidate?.role === "installer") ?? ownCards[0];
  const own = Number(
    ((card?.payConfig as { ratesByWorkType?: Record<string, unknown> } | undefined)?.ratesByWorkType ?? {}).connect,
  );
  return own > 0 ? own : toNumber(service?.installation_cost_per_sqft);
}

export async function recordInstallerPayrollAccrual(
  tx: Prisma.TransactionClient,
  installerJobId: string,
  accruedAt: Date,
) {
  const job = await tx.installerJob.findUnique({
    where: { installer_job_id: installerJobId },
    include: {
      position: {
        include: {
          service_type: true,
          complexity_level: true,
        },
      },
    },
  });

  if (!job?.position) return null;

  const quantitySqft =
    jsonNumber(job.position.dynamic_fields, "actual_film_sqft") ||
    jsonNumber(job.position.dynamic_fields, "sqft");
  const ratePerSqft =
    jsonNumber(job.position.dynamic_fields, "manual_installation_cost_per_sqft") ||
    toNumber(job.position.service_type.installation_cost_per_sqft);
  // Positions installed before 2026-09-01 carry a snapshot (migration 20260930120000):
  // their own coefficient and no automatic zone pay, even if closed later.
  const multiplier =
    jsonNumber(job.position.dynamic_fields, "complexity_multiplier") ||
    toNumber(job.position.complexity_level?.multiplier) ||
    1;
  const legacyPosition =
    (job.position.dynamic_fields as Record<string, unknown> | null)?.owner_pay_rules === false;
  // Smart zone connections pay the ZONE_CONNECTION installer rate (rate directory).
  const ownerRules = accruedAt >= OWNER_PAY_RULES_FROM && !legacyPosition;
  const zoneCount =
    ownerRules && job.position.service_type.service_code === "SMART_FILM"
      ? jsonNumber(job.position.dynamic_fields, "zones_qty")
      : 0;
  const zoneRate = zoneCount ? await installerZoneRate(tx, job.installer_id) : 0;
  const amount = calculatePayrollAmount(quantitySqft, ratePerSqft, multiplier, zoneCount, zoneRate);

  // Team lead at completion (snapshot): 10% of this installer's pay, on top.
  const installer = await tx.user.findUnique({
    where: { user_id: job.installer_id },
    select: {
      installer_lead: {
        select: {
          user_id: true,
          is_active: true,
          user_accesses: { where: { is_active: true }, select: { role: { select: { code: true } } } },
        },
      },
    },
  });
  const lead = installer?.installer_lead;
  const leadEligible =
    ownerRules &&
    lead?.is_active &&
    lead.user_id !== job.installer_id &&
    lead.user_accesses.some((access) => access.role.code === "INSTALLER_LEAD");
  const leadOverrideAmount = leadEligible ? Number((amount * INSTALLER_LEAD_OVERRIDE_PCT / 100).toFixed(2)) : 0;

  return tx.installerPayrollAccrual.upsert({
    where: { installer_job_id: installerJobId },
    create: {
      installer_id: job.installer_id,
      installer_job_id: installerJobId,
      project_id: job.project_id,
      service_name: job.position.service_type.name_ru,
      quantity_sqft: quantitySqft,
      rate_per_sqft: ratePerSqft,
      complexity_multiplier: multiplier,
      amount,
      lead_id: leadEligible ? lead!.user_id : null,
      lead_override_amount: leadOverrideAmount,
      accrued_at: accruedAt,
    },
    update: {},
  });
}

/** Owner paid an employee for a period: their accruals and lead overrides become paid. */
export async function markInstallerPayrollPaid(input: { legacyUserId: string; start: Date; end: Date }) {
  const user = await prisma.user.findFirst({
    where: { legacy_user_ids: { has: input.legacyUserId } },
    select: { user_id: true },
  });
  if (!user) return null;
  const period = { gte: input.start, lte: input.end };
  return prisma.$transaction(async (tx) => {
    const own = await tx.installerPayrollAccrual.updateMany({
      where: { installer_id: user.user_id, status: "owed", accrued_at: period },
      data: { status: "paid" },
    });
    const lead = await tx.installerPayrollAccrual.updateMany({
      where: { lead_id: user.user_id, lead_override_status: "owed", lead_override_amount: { gt: 0 }, accrued_at: period },
      data: { lead_override_status: "paid" },
    });
    return { user_id: user.user_id, accruals_paid: own.count, lead_overrides_paid: lead.count };
  });
}

function sessionDurationMinutes(startedAt: Date, endedAt: Date | null, storedMinutes: number) {
  if (endedAt) return storedMinutes;
  return Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 60_000));
}

function serializeWorkSession(session: {
  work_session_id: string;
  started_at: Date;
  ended_at: Date | null;
  work_minutes: number;
  start_odometer_miles: Prisma.Decimal | null;
  end_odometer_miles: Prisma.Decimal | null;
  miles_driven: Prisma.Decimal;
  tracking_enabled: boolean;
  last_latitude: Prisma.Decimal | null;
  last_longitude: Prisma.Decimal | null;
  last_accuracy_meters: Prisma.Decimal | null;
  last_location_at: Date | null;
  notes: string | null;
  installer_job: null | {
    installer_job_id: string;
    project: { project_code: string | null; title: string; address: string | null };
    position: { title: string | null; service_type: { name_ru: string } } | null;
  };
}) {
  return {
    ...session,
    work_minutes: sessionDurationMinutes(session.started_at, session.ended_at, session.work_minutes),
    start_odometer_miles: session.start_odometer_miles ? toNumber(session.start_odometer_miles) : null,
    end_odometer_miles: session.end_odometer_miles ? toNumber(session.end_odometer_miles) : null,
    miles_driven: toNumber(session.miles_driven),
    last_latitude: session.last_latitude ? toNumber(session.last_latitude) : null,
    last_longitude: session.last_longitude ? toNumber(session.last_longitude) : null,
    last_accuracy_meters: session.last_accuracy_meters ? toNumber(session.last_accuracy_meters) : null,
  };
}

const workSessionInclude = {
  installer_job: {
    select: {
      installer_job_id: true,
      project: { select: { project_code: true, title: true, address: true } },
      position: { select: { title: true, service_type: { select: { name_ru: true } } } },
    },
  },
} satisfies Prisma.InstallerWorkSessionInclude;

export async function getInstallerOperationsDashboard(session: InstallerSession) {
  const installerId = session.user.user_id;
  const [activeSession, history, accruals, jobs, leadRows, ownTotals, leadTotals] = await Promise.all([
    prisma.installerWorkSession.findFirst({
      where: { installer_id: installerId, ended_at: null },
      include: workSessionInclude,
      orderBy: { started_at: "desc" },
    }),
    prisma.installerWorkSession.findMany({
      where: { installer_id: installerId, ended_at: { not: null } },
      include: workSessionInclude,
      orderBy: { started_at: "desc" },
      take: 30,
    }),
    prisma.installerPayrollAccrual.findMany({
      where: { installer_id: installerId },
      include: { project: { select: { project_code: true, title: true } } },
      orderBy: { accrued_at: "desc" },
      take: 40,
    }),
    prisma.installerJob.findMany({
      where: { installer_id: installerId, status: { not: "completed" } },
      include: {
        project: { select: { project_code: true, title: true, address: true } },
        position: { select: { title: true, service_type: { select: { name_ru: true } } } },
      },
      orderBy: { created_at: "desc" },
    }),
    // A team lead's 10% of each group installer's completed job.
    prisma.installerPayrollAccrual.findMany({
      where: { lead_id: installerId, lead_override_amount: { gt: 0 } },
      include: {
        project: { select: { project_code: true, title: true } },
        installer: { select: { full_name: true } },
      },
      orderBy: { accrued_at: "desc" },
      take: 40,
    }),
    // Totals over all rows; the lists above only show recent history.
    prisma.installerPayrollAccrual.groupBy({
      by: ["status"],
      where: { installer_id: installerId },
      _sum: { amount: true },
    }),
    prisma.installerPayrollAccrual.groupBy({
      by: ["lead_override_status"],
      where: { lead_id: installerId, lead_override_amount: { gt: 0 } },
      _sum: { lead_override_amount: true },
    }),
  ]);

  const serializedHistory = history.map(serializeWorkSession);
  const totalMinutes = serializedHistory.reduce((sum, item) => sum + item.work_minutes, 0) +
    (activeSession ? sessionDurationMinutes(activeSession.started_at, null, 0) : 0);
  const totalMiles = serializedHistory.reduce((sum, item) => sum + item.miles_driven, 0);
  const ownSum = (status: string) => toNumber(ownTotals.find((row) => row.status === status)?._sum.amount ?? 0);
  const leadSum = (status: string) =>
    toNumber(leadTotals.find((row) => row.lead_override_status === status)?._sum.lead_override_amount ?? 0);
  const owed = Number((ownSum("owed") + leadSum("owed")).toFixed(2));
  const paid = Number((ownSum("paid") + leadSum("paid")).toFixed(2));

  return {
    active_session: activeSession ? serializeWorkSession(activeSession) : null,
    history: serializedHistory,
    jobs,
    payroll: accruals.map((item) => ({
      ...item,
      quantity_sqft: toNumber(item.quantity_sqft),
      rate_per_sqft: toNumber(item.rate_per_sqft),
      complexity_multiplier: toNumber(item.complexity_multiplier),
      amount: toNumber(item.amount),
      lead_override_amount: toNumber(item.lead_override_amount),
    })),
    lead_payroll: leadRows.map((item) => ({
      payroll_accrual_id: item.payroll_accrual_id,
      project: item.project,
      installer_name: item.installer.full_name,
      service_name: item.service_name,
      amount: toNumber(item.lead_override_amount),
      status: item.lead_override_status,
      accrued_at: item.accrued_at,
    })),
    totals: { work_minutes: totalMinutes, miles: Number(totalMiles.toFixed(1)), owed, paid },
  };
}

export async function startInstallerWorkSession(
  session: InstallerSession,
  input: { installer_job_id?: string | null; start_odometer_miles?: number | null; tracking_enabled?: boolean },
) {
  const installerId = session.user.user_id;
  const existing = await prisma.installerWorkSession.findFirst({
    where: { installer_id: installerId, ended_at: null },
    select: { work_session_id: true },
  });
  if (existing) return "already_active" as const;

  if (input.installer_job_id) {
    const job = await prisma.installerJob.findFirst({
      where: { installer_job_id: input.installer_job_id, installer_id: installerId, status: { not: "completed" } },
      select: { installer_job_id: true },
    });
    if (!job) return "job_not_found" as const;
  }

  const trackingEnabled = Boolean(input.tracking_enabled);
  try {
    return await prisma.installerWorkSession.create({
      data: {
        installer_id: installerId,
        installer_job_id: input.installer_job_id || null,
        start_odometer_miles: input.start_odometer_miles ?? null,
        tracking_enabled: trackingEnabled,
        tracking_consent_at: trackingEnabled ? new Date() : null,
      },
      include: workSessionInclude,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return "already_active" as const;
    }
    throw error;
  }
}

export async function stopInstallerWorkSession(
  session: InstallerSession,
  input: { end_odometer_miles?: number | null; miles_driven?: number | null; notes?: string | null },
) {
  const active = await prisma.installerWorkSession.findFirst({
    where: { installer_id: session.user.user_id, ended_at: null },
  });
  if (!active) return null;

  const endedAt = new Date();
  const workMinutes = Math.max(1, Math.round((endedAt.getTime() - active.started_at.getTime()) / 60_000));
  const odometerMiles =
    active.start_odometer_miles && input.end_odometer_miles != null
      ? Math.max(0, input.end_odometer_miles - toNumber(active.start_odometer_miles))
      : 0;
  const milesDriven = odometerMiles || Math.max(0, input.miles_driven ?? 0);

  return prisma.installerWorkSession.update({
    where: { work_session_id: active.work_session_id },
    data: {
      ended_at: endedAt,
      work_minutes: workMinutes,
      end_odometer_miles: input.end_odometer_miles ?? null,
      miles_driven: Number(milesDriven.toFixed(1)),
      tracking_enabled: false,
      notes: input.notes?.trim() || null,
    },
    include: workSessionInclude,
  });
}

export async function recordInstallerLocation(
  session: InstallerSession,
  input: { latitude: number; longitude: number; accuracy_meters?: number | null; captured_at?: string | null },
) {
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90 ||
      !Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    return "invalid_location" as const;
  }

  const active = await prisma.installerWorkSession.findFirst({
    where: { installer_id: session.user.user_id, ended_at: null, tracking_enabled: true },
    select: { work_session_id: true },
  });
  if (!active) return null;

  const capturedAt = input.captured_at ? new Date(input.captured_at) : new Date();
  if (Number.isNaN(capturedAt.getTime())) return "invalid_location" as const;

  return prisma.$transaction(async (tx) => {
    await tx.installerWorkSession.update({
      where: { work_session_id: active.work_session_id },
      data: {
        last_latitude: input.latitude,
        last_longitude: input.longitude,
        last_accuracy_meters: input.accuracy_meters ?? null,
        last_location_at: capturedAt,
      },
    });
    return tx.installerLocationPoint.create({
      data: {
        work_session_id: active.work_session_id,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy_meters: input.accuracy_meters ?? null,
        captured_at: capturedAt,
      },
    });
  });
}

export async function getInstallerTeamOverview() {
  const installers = await prisma.user.findMany({
    where: { is_active: true, user_accesses: { some: { is_active: true, role: { code: "INSTALLER" } } } },
    select: {
      user_id: true,
      full_name: true,
      email: true,
      installer_work_sessions: {
        where: { ended_at: null },
        include: workSessionInclude,
        orderBy: { started_at: "desc" },
        take: 1,
      },
    },
    orderBy: { full_name: "asc" },
  });

  return installers.map((installer) => ({
    user_id: installer.user_id,
    full_name: installer.full_name,
    email: installer.email,
    active_session: installer.installer_work_sessions[0]
      ? serializeWorkSession(installer.installer_work_sessions[0])
      : null,
  }));
}
