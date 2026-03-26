import type { DashboardDateRange } from "../src/types/dashboard";

const IST_OFFSET_MINUTES = 5 * 60 + 30;

function parseDateParts(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function parseTimeParts(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return { hours, minutes };
}

function buildUtcIsoFromIst(
  date: string,
  time: string,
  seconds: number,
  milliseconds: number,
) {
  const { year, month, day } = parseDateParts(date);
  const { hours, minutes } = parseTimeParts(time);
  const utcMillis =
    Date.UTC(year, month - 1, day, hours, minutes, seconds, milliseconds) -
    IST_OFFSET_MINUTES * 60 * 1000;

  return new Date(utcMillis).toISOString();
}

export function getUtcRangeForIst(dateRange: DashboardDateRange) {
  return {
    startIso: buildUtcIsoFromIst(dateRange.from, dateRange.fromTime, 0, 0),
    endInclusiveIso: buildUtcIsoFromIst(dateRange.to, dateRange.toTime, 59, 999),
  };
}
