import type { DashboardDateRange } from "../types/dashboard";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function getTodayDateString(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isValidDateString(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function normalizeDateRange(
  from: string | null | undefined,
  to: string | null | undefined,
  fallback = getTodayDateString(),
): DashboardDateRange {
  const safeFrom = isValidDateString(from) ? from : fallback;
  const safeTo = isValidDateString(to) ? to : safeFrom;

  if (safeFrom <= safeTo) {
    return { from: safeFrom, to: safeTo };
  }

  return { from: safeTo, to: safeFrom };
}

export function formatDateRangeLabel(value: string) {
  if (!isValidDateString(value)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}
