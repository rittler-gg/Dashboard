import { useMemo, useState } from "react";
import { IndiaMapPanel } from "../components/IndiaMapPanel";
import { KpiCard } from "../components/KpiCard";
import { OrderFeed } from "../components/OrderFeed";
import type { DashboardState } from "../types/dashboard";
import {
  formatCompactNumber,
  formatCurrency,
  formatDashboardRevenue,
} from "../utils/format";

interface OverviewPageProps {
  state: DashboardState;
}

function formatDateInputValue(isoString: string) {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getStartOfDay(dateString: string) {
  return new Date(`${dateString}T00:00:00`).getTime();
}

function getEndOfDay(dateString: string) {
  return new Date(`${dateString}T23:59:59.999`).getTime();
}

export function OverviewPage({ state }: OverviewPageProps) {
  const availableDateRange = useMemo(() => {
    const timestamps = state.orders.map((order) => order.timestamp);
    const latestDate = timestamps[0] ?? new Date().toISOString();
    const oldestDate = timestamps[timestamps.length - 1] ?? latestDate;

    return {
      min: formatDateInputValue(oldestDate),
      max: formatDateInputValue(latestDate),
    };
  }, [state.orders]);

  const [startDate, setStartDate] = useState(() => availableDateRange.min);
  const [endDate, setEndDate] = useState(() => availableDateRange.max);

  const scopedKpis = useMemo(() => {
    const rangeStart = getStartOfDay(startDate);
    const rangeEnd = getEndOfDay(endDate);
    const scopedOrders = state.orders.filter(
      (order) => {
        const timestamp = Number(new Date(order.timestamp));
        return timestamp >= rangeStart && timestamp <= rangeEnd;
      },
    );
    const totalRevenue = scopedOrders.reduce((sum, order) => sum + order.orderValue, 0);
    const totalOrders = scopedOrders.length;

    return {
      totalOrders,
      totalRevenue,
      averageOrderValue: totalOrders === 0 ? 0 : Math.round(totalRevenue / totalOrders),
    };
  }, [endDate, startDate, state.orders]);

  return (
    <div className="overview-grid">
      <IndiaMapPanel orders={state.orders} highlightedOrder={state.lastOrder} />
      <div className="overview-feed-overlay">
        <OrderFeed orders={state.orders} />
      </div>
      <aside className="overview-sidebar">
        <section className="kpi-grid">
          <article className="panel kpi-card time-range-panel" aria-label="Totals time range">
            <div className="kpi-head">
              <span>Date Range</span>
            </div>
            <div className="time-range-selector">
              <label className="time-range-field">
                <span>From</span>
                <input
                  className="time-range-input"
                  type="date"
                  value={startDate}
                  max={endDate}
                  min={availableDateRange.min}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>
              <label className="time-range-field">
                <span>To</span>
                <input
                  className="time-range-input"
                  type="date"
                  value={endDate}
                  min={startDate}
                  max={availableDateRange.max}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </label>
            </div>
          </article>
          <KpiCard
            label="Total Orders"
            value={formatCompactNumber(scopedKpis.totalOrders)}
            accent="#f7c66d"
            helper={`AOV ${formatCurrency(scopedKpis.averageOrderValue)}`}
          />
          <KpiCard
            label="Total Revenue"
            value={formatDashboardRevenue(scopedKpis.totalRevenue)}
            accent="#f3a86c"
            helper="Gross value within selected range"
          />
          <KpiCard
            label="Live Traffic"
            value={formatCompactNumber(state.traffic.activeUsers)}
            accent="#e66f51"
            helper={`${state.traffic.delta >= 0 ? "+" : ""}${state.traffic.delta} vs last pulse`}
          />
        </section>
      </aside>
    </div>
  );
}
