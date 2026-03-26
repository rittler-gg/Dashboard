import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { DashboardDateRange } from "../types/dashboard";
import {
  formatDateRangeLabel,
  getTodayDateString,
  normalizeDateRange,
} from "../utils/dateRange";

function setRangeParams(current: URLSearchParams, next: DashboardDateRange) {
  const params = new URLSearchParams(current);
  params.set("from", next.from);
  params.set("to", next.to);
  return params;
}

export function useDashboardDateRange() {
  const [searchParams, setSearchParams] = useSearchParams();
  const today = useMemo(() => getTodayDateString(), []);
  const dateRange = useMemo(
    () => normalizeDateRange(searchParams.get("from"), searchParams.get("to"), today),
    [searchParams, today],
  );

  useEffect(() => {
    const currentFrom = searchParams.get("from");
    const currentTo = searchParams.get("to");

    if (currentFrom === dateRange.from && currentTo === dateRange.to) {
      return;
    }

    setSearchParams(setRangeParams(searchParams, dateRange), { replace: true });
  }, [dateRange, searchParams, setSearchParams]);

  return {
    dateRange,
    setFrom(nextFrom: string) {
      const nextRange = normalizeDateRange(nextFrom, searchParams.get("to"), today);
      setSearchParams(setRangeParams(searchParams, nextRange));
    },
    setTo(nextTo: string) {
      const nextRange = normalizeDateRange(searchParams.get("from"), nextTo, today);
      setSearchParams(setRangeParams(searchParams, nextRange));
    },
    fromLabel: formatDateRangeLabel(dateRange.from),
    toLabel: formatDateRangeLabel(dateRange.to),
  };
}
