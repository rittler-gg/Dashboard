import type { DashboardDateRange } from "../types/dashboard";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function getTodayDateString(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function getCurrentTimeString(now = new Date()) {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function isValidDateString(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function isValidTimeString(value: string | null | undefined): value is string {
  return Boolean(value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
}

function compareDateTimes(left: Pick<DashboardDateRange, "from" | "fromTime">, right: Pick<DashboardDateRange, "to" | "toTime">) {
  return `${left.from}T${left.fromTime}`.localeCompare(`${right.to}T${right.toTime}`);
}

export function normalizeDateRange(
  from: string | null | undefined,
  to: string | null | undefined,
  fromTime: string | null | undefined,
  toTime: string | null | undefined,
  fallbackDate = getTodayDateString(),
  fallbackTime = getCurrentTimeString(),
): DashboardDateRange {
  const safeFrom = isValidDateString(from) ? from : fallbackDate;
  const safeTo = isValidDateString(to) ? to : safeFrom;
  const safeFromTime = isValidTimeString(fromTime) ? fromTime : "00:00";
  const safeToTime = isValidTimeString(toTime) ? toTime : fallbackTime;
  const normalized = {
    from: safeFrom,
    to: safeTo,
    fromTime: safeFromTime,
    toTime: safeToTime,
  };

  if (compareDateTimes(normalized, normalized) <= 0) {
    return normalized;
  }

  return {
    from: safeTo,
    to: safeFrom,
    fromTime: safeToTime,
    toTime: safeFromTime,
  };
}

export function formatDateRangeLabel(date: string, time: string) {
  if (!isValidDateString(date) || !isValidTimeString(time)) {
    return `${date} ${time}`.trim();
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(`${date}T${time}:00`));
}
