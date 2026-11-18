/**
 * Day arithmetic of the calendar screen. Days are plain "YYYY-MM-DD" keys of
 * the viewer's own calendar, so nothing here depends on a time zone.
 */

export type CalendarMode = "week" | "month";

const pad = (value: number) => String(value).padStart(2, "0");
const parse = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
};
const format = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

export function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(key: string, days: number) {
  const date = parse(key);
  date.setUTCDate(date.getUTCDate() + days);
  return format(date);
}

/** Monday of the week the day is in — the working calendar's week also starts on Monday. */
export function weekStart(key: string) {
  return addDays(key, -((parse(key).getUTCDay() + 6) % 7));
}

/** The days on the screen: one week, or the whole weeks that cover the month. */
export function calendarDays(anchor: string, mode: CalendarMode) {
  if (mode === "week") {
    const start = weekStart(anchor);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }
  const first = `${anchor.slice(0, 8)}01`;
  const date = parse(first);
  const last = format(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
  const start = weekStart(first);
  const days: string[] = [];
  for (let day = start; day <= last || days.length % 7 !== 0; day = addDays(day, 1)) days.push(day);
  return days;
}

/** The anchor after «назад» / «вперёд». */
export function shiftAnchor(anchor: string, mode: CalendarMode, direction: 1 | -1) {
  if (mode === "week") return addDays(anchor, 7 * direction);
  const date = parse(`${anchor.slice(0, 8)}01`);
  return format(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + direction, 1)));
}

export function rangeLabel(days: string[], anchor: string, mode: CalendarMode) {
  if (mode === "month") return parse(anchor).toLocaleDateString("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" });
  const first = parse(days[0]);
  const last = parse(days[days.length - 1]);
  const sameMonth = first.getUTCMonth() === last.getUTCMonth();
  const from = first.toLocaleDateString("ru-RU", sameMonth ? { day: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" });
  return `${from} – ${last.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}`;
}

export function dayParts(key: string) {
  const date = parse(key);
  return {
    weekday: date.toLocaleDateString("ru-RU", { weekday: "short", timeZone: "UTC" }),
    day: date.getUTCDate(),
    long: date.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }),
  };
}

export const CALENDAR_KINDS = [
  { id: "all", title: "Все" },
  { id: "consultation", title: "Консультации" },
  { id: "measure", title: "Замеры" },
  { id: "install", title: "Монтажи" },
  { id: "complaint", title: "Рекламации" },
] as const;
