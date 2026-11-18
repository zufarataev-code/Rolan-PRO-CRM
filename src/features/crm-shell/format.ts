export function money(value: number) {
  return `$${new Intl.NumberFormat("ru-RU").format(Math.round(Number(value) || 0))}`;
}

/** $12 400 → «$12,4 тыс.» for tight places (column heads, chart axes). */
export function moneyShort(value: number) {
  const amount = Number(value) || 0;
  if (Math.abs(amount) < 10000) return money(amount);
  return `$${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(amount / 1000)} тыс.`;
}

export function dateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** The project card of the working CRM: every action of a project still lives there. */
export function legacyProjectHref(projectId: string) {
  return `/legacy-crm#/order/${encodeURIComponent(projectId)}`;
}
