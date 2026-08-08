import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_FILE_PATH = path.join(process.cwd(), "data", "company-overhead.json");

export const COMPANY_OVERHEAD_FIELDS = [
  {
    key: "office_rent_monthly",
    label_ru: "Офис / аренда",
    description_ru: "Аренда офиса, склада и базовая инфраструктура.",
  },
  {
    key: "admin_payroll_monthly",
    label_ru: "Админ зарплаты",
    description_ru: "Администратор, координатор, back office.",
  },
  {
    key: "sales_payroll_monthly",
    label_ru: "Sales payroll",
    description_ru: "Фиксированные оклады sales / estimator команды.",
  },
  {
    key: "ops_payroll_monthly",
    label_ru: "Ops payroll",
    description_ru: "Операционный менеджмент и диспетчеризация.",
  },
  {
    key: "marketing_monthly",
    label_ru: "Маркетинг",
    description_ru: "Реклама, lead gen, production и digital support.",
  },
  {
    key: "software_monthly",
    label_ru: "Софт / CRM",
    description_ru: "Подписки, SaaS, телефония и CRM-стек.",
  },
  {
    key: "transport_monthly",
    label_ru: "Транспорт",
    description_ru: "Топливо, логистика и сервисные поездки.",
  },
  {
    key: "utilities_monthly",
    label_ru: "Коммунальные",
    description_ru: "Электричество, интернет и сервисные счета.",
  },
  {
    key: "misc_monthly",
    label_ru: "Прочий overhead",
    description_ru: "Прочие постоянные расходы компании.",
  },
] as const;

export type CompanyOverheadFieldKey = (typeof COMPANY_OVERHEAD_FIELDS)[number]["key"];

export type CompanyOverheadConfig = Record<CompanyOverheadFieldKey, number> & {
  updated_at: string;
};

const DEFAULT_COMPANY_OVERHEAD: CompanyOverheadConfig = {
  office_rent_monthly: 2600,
  admin_payroll_monthly: 2200,
  sales_payroll_monthly: 1800,
  ops_payroll_monthly: 1400,
  marketing_monthly: 700,
  software_monthly: 250,
  transport_monthly: 450,
  utilities_monthly: 150,
  misc_monthly: 200,
  updated_at: "2026-04-13T00:00:00.000Z",
};

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function getInclusiveDayCount(startDate: Date, endDate: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((startOfUtcDay(endDate).getTime() - startOfUtcDay(startDate).getTime()) / msPerDay) + 1;
}

function getDaysInUtcMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function coerceConfig(input: unknown): CompanyOverheadConfig {
  const payload = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};

  return {
    ...DEFAULT_COMPANY_OVERHEAD,
    ...Object.fromEntries(
      COMPANY_OVERHEAD_FIELDS.map((field) => [field.key, toNumber(payload[field.key] ?? DEFAULT_COMPANY_OVERHEAD[field.key])]),
    ),
    updated_at:
      typeof payload.updated_at === "string" && payload.updated_at.trim()
        ? payload.updated_at
        : DEFAULT_COMPANY_OVERHEAD.updated_at,
  };
}

async function ensureCompanyOverheadFile() {
  await mkdir(path.dirname(DATA_FILE_PATH), { recursive: true });

  try {
    await readFile(DATA_FILE_PATH, "utf8");
  } catch {
    await writeFile(DATA_FILE_PATH, `${JSON.stringify(DEFAULT_COMPANY_OVERHEAD, null, 2)}\n`, "utf8");
  }
}

export async function readCompanyOverheadConfig() {
  await ensureCompanyOverheadFile();
  const raw = await readFile(DATA_FILE_PATH, "utf8");
  return coerceConfig(JSON.parse(raw));
}

export async function updateCompanyOverheadConfig(patch: Partial<Record<CompanyOverheadFieldKey, unknown>>) {
  const current = await readCompanyOverheadConfig();
  const next: CompanyOverheadConfig = {
    ...current,
    ...Object.fromEntries(COMPANY_OVERHEAD_FIELDS.map((field) => [field.key, toNumber(patch[field.key] ?? current[field.key])])),
    updated_at: new Date().toISOString(),
  };

  await writeFile(DATA_FILE_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");

  return next;
}

export function getCompanyOverheadRows(config: CompanyOverheadConfig) {
  return COMPANY_OVERHEAD_FIELDS.map((field) => ({
    key: field.key,
    label_ru: field.label_ru,
    description_ru: field.description_ru,
    monthly_amount: Number(config[field.key].toFixed(2)),
  }));
}

export function calculateProratedCompanyOverhead(
  config: CompanyOverheadConfig,
  range?: {
    start_date?: Date | null;
    end_date?: Date | null;
  },
) {
  const monthlyRows = getCompanyOverheadRows(config);
  const monthlyTotal = Number(monthlyRows.reduce((sum, row) => sum + row.monthly_amount, 0).toFixed(2));
  const rawStartDate = range?.start_date ? startOfUtcDay(range.start_date) : null;
  const rawEndDate = range?.end_date ? startOfUtcDay(range.end_date) : null;

  if (!rawStartDate || !rawEndDate || rawEndDate.getTime() < rawStartDate.getTime()) {
    return {
      monthly_total: monthlyTotal,
      total_period_amount: 0,
      period_days: 0,
      period_months_equivalent: 0,
      start_date: rawStartDate,
      end_date: rawEndDate,
      rows: monthlyRows.map((row) => ({
        ...row,
        period_amount: 0,
      })),
    };
  }

  const rowTotals = new Map(monthlyRows.map((row) => [row.key, 0]));
  let cursor = new Date(Date.UTC(rawStartDate.getUTCFullYear(), rawStartDate.getUTCMonth(), 1));

  while (cursor.getTime() <= rawEndDate.getTime()) {
    const monthStart = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), getDaysInUtcMonth(cursor.getUTCFullYear(), cursor.getUTCMonth())));
    const overlapStart = rawStartDate.getTime() > monthStart.getTime() ? rawStartDate : monthStart;
    const overlapEnd = rawEndDate.getTime() < monthEnd.getTime() ? rawEndDate : monthEnd;

    if (overlapEnd.getTime() >= overlapStart.getTime()) {
      const overlapDays = getInclusiveDayCount(overlapStart, overlapEnd);
      const daysInMonth = getDaysInUtcMonth(cursor.getUTCFullYear(), cursor.getUTCMonth());

      for (const row of monthlyRows) {
        const nextValue = (rowTotals.get(row.key) ?? 0) + (row.monthly_amount * overlapDays) / daysInMonth;
        rowTotals.set(row.key, nextValue);
      }
    }

    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  const rows = monthlyRows.map((row) => ({
    ...row,
    period_amount: Number((rowTotals.get(row.key) ?? 0).toFixed(2)),
  }));
  const totalPeriodAmount = Number(rows.reduce((sum, row) => sum + row.period_amount, 0).toFixed(2));
  const periodDays = getInclusiveDayCount(rawStartDate, rawEndDate);

  return {
    monthly_total: monthlyTotal,
    total_period_amount: totalPeriodAmount,
    period_days: periodDays,
    period_months_equivalent: monthlyTotal > 0 ? Number((totalPeriodAmount / monthlyTotal).toFixed(2)) : 0,
    start_date: rawStartDate,
    end_date: rawEndDate,
    rows,
  };
}
