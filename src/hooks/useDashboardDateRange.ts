import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import type { DashboardDateRange } from "../types/dashboard";
import {
  formatDateRangeLabel,
  getCurrentTimeString,
  getTodayDateString,
  normalizeDateRange,
} from "../utils/dateRange";

function setRangeParams(current: URLSearchParams, next: DashboardDateRange) {
  const params = new URLSearchParams(current);
  params.set("from", next.from);
  params.set("to", next.to);
  params.set("fromTime", next.fromTime);
  params.set("toTime", next.toTime);
  return params;
}

export function useDashboardDateRange() {
  const [searchParams, setSearchParams] = useSearchParams();
  const autoFollowNowRef = useRef(
    !searchParams.get("from") &&
      !searchParams.get("to") &&
      !searchParams.get("fromTime") &&
      !searchParams.get("toTime"),
  );
  const today = getTodayDateString();
  const currentTime = getCurrentTimeString();
  const dateRange = useMemo(
    () =>
      normalizeDateRange(
        searchParams.get("from"),
        searchParams.get("to"),
        searchParams.get("fromTime"),
        searchParams.get("toTime"),
        today,
        currentTime,
      ),
    [searchParams, today, currentTime],
  );

  useEffect(() => {
    const currentFrom = searchParams.get("from");
    const currentTo = searchParams.get("to");
    const currentFromTime = searchParams.get("fromTime");
    const currentToTime = searchParams.get("toTime");

    if (
      currentFrom === dateRange.from &&
      currentTo === dateRange.to &&
      currentFromTime === dateRange.fromTime &&
      currentToTime === dateRange.toTime
    ) {
      return;
    }

    setSearchParams(setRangeParams(searchParams, dateRange), { replace: true });
  }, [dateRange, searchParams, setSearchParams]);

  useEffect(() => {
    if (!autoFollowNowRef.current) {
      return;
    }

    if (dateRange.to !== today || dateRange.toTime === currentTime) {
      return;
    }

    const nextRange = normalizeDateRange(
      dateRange.from,
      today,
      dateRange.fromTime,
      currentTime,
      today,
      currentTime,
    );

    setSearchParams(setRangeParams(searchParams, nextRange), { replace: true });
  }, [
    currentTime,
    dateRange.from,
    dateRange.fromTime,
    dateRange.to,
    dateRange.toTime,
    searchParams,
    setSearchParams,
    today,
  ]);

  return {
    dateRange,
    setFrom(nextFrom: string) {
      autoFollowNowRef.current = false;
      const nextRange = normalizeDateRange(
        nextFrom,
        searchParams.get("to"),
        searchParams.get("fromTime"),
        searchParams.get("toTime"),
        today,
        currentTime,
      );
      setSearchParams(setRangeParams(searchParams, nextRange));
    },
    setTo(nextTo: string) {
      autoFollowNowRef.current = false;
      const nextRange = normalizeDateRange(
        searchParams.get("from"),
        nextTo,
        searchParams.get("fromTime"),
        searchParams.get("toTime"),
        today,
        currentTime,
      );
      setSearchParams(setRangeParams(searchParams, nextRange));
    },
    setFromTime(nextFromTime: string) {
      autoFollowNowRef.current = false;
      const nextRange = normalizeDateRange(
        searchParams.get("from"),
        searchParams.get("to"),
        nextFromTime,
        searchParams.get("toTime"),
        today,
        currentTime,
      );
      setSearchParams(setRangeParams(searchParams, nextRange));
    },
    setToTime(nextToTime: string) {
      autoFollowNowRef.current = false;
      const nextRange = normalizeDateRange(
        searchParams.get("from"),
        searchParams.get("to"),
        searchParams.get("fromTime"),
        nextToTime,
        today,
        currentTime,
      );
      setSearchParams(setRangeParams(searchParams, nextRange));
    },
    fromLabel: formatDateRangeLabel(dateRange.from, dateRange.fromTime),
    toLabel: formatDateRangeLabel(dateRange.to, dateRange.toTime),
  };
}
