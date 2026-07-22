const amsterdamTimeZone = "Europe/Amsterdam";

export function toMonthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

export function addMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, 0, 0, 0, 0));
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function monthInputValue(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function parseMonthInput(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return toMonthStart();
  }

  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}

export function displayMonth(date: Date) {
  return new Intl.DateTimeFormat("nl-NL", {
    month: "long",
    year: "numeric",
    timeZone: amsterdamTimeZone
  }).format(date);
}

export function displayDate(date: Date | string) {
  const value = typeof date === "string" ? new Date(`${date}T12:00:00.000Z`) : date;

  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: amsterdamTimeZone
  }).format(value);
}

export function dateInputToDate(value: string) {
  return new Date(`${value}T18:00:00.000Z`);
}

export function jsonDateList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item));
}
