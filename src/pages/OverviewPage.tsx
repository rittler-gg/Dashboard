import { useEffect, useMemo, useState } from "react";
import { IndiaMapPanel } from "../components/IndiaMapPanel";
import { KpiCard } from "../components/KpiCard";
import { OrderFeed } from "../components/OrderFeed";
import type { DashboardDateRange, DashboardState, MapMarker } from "../types/dashboard";
import {
  formatTrafficNumber,
  formatCurrency,
  formatDashboardRevenue,
} from "../utils/format";

interface OverviewPageProps {
  state: DashboardState;
  dateRange: DashboardDateRange;
}

const RAW_MAP_MARKER_COUNT = 260;
const MAP_RIPPLE_WINDOW_MS = 3 * 60 * 1000;
const MAP_RIPPLE_MARKER_COUNT = 4;

export function OverviewPage({ state }: OverviewPageProps) {
  const [now, setNow] = useState(() => Date.now());
  const scopedKpis = state.aggregateSnapshot.kpis;
  const unitsPerOrder =
    scopedKpis.totalOrders === 0 ? 0 : state.aggregateSnapshot.kpis.totalUnits / scopedKpis.totalOrders;

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const mapMarkers = useMemo<MapMarker[]>(
    () =>
      state.recentOrders
        .slice(0, RAW_MAP_MARKER_COUNT)
        .map((order, index) => ({
        id: `raw-map-${order.id}`,
        orderId: order.id,
        timestamp: order.timestamp,
        city: order.city,
        state: order.state,
        orderValue: order.orderValue,
        brand: order.brand,
        lat: order.lat,
        lng: order.lng,
        placement:
          order.locationResolution === "unknown"
            ? "unknown"
            : order.isOutOfIndia
              ? "outskirts"
              : "india",
        edge:
          order.isOutOfIndia && order.lng !== null && order.lat !== null
            ? order.lng < 68
              ? "west"
              : order.lng > 97.5
                ? "east"
                : order.lat < 6
                  ? "south"
                  : "north"
            : undefined,
        locationResolution: order.locationResolution,
        highlighted:
          index < MAP_RIPPLE_MARKER_COUNT &&
          now - new Date(order.timestamp).getTime() <= MAP_RIPPLE_WINDOW_MS,
        expiresAt: Number.MAX_SAFE_INTEGER,
      })),
    [now, state.recentOrders],
  );

  return (
    <div className="overview-grid">
      <section className="overview-kpi-strip">
        <KpiCard
          label="Total Orders"
          value={scopedKpis.totalOrders.toLocaleString("en-IN")}
          accent="#f7c66d"
          helper="Orders in selected range"
        />
        <KpiCard
          label="Total Revenue"
          value={formatDashboardRevenue(scopedKpis.totalRevenue)}
          accent="#f3a86c"
          helper={`Snapshot as of ${new Date(state.aggregateSnapshot.asOf).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          })}`}
        />
        <KpiCard
          label="AOV"
          value={formatCurrency(scopedKpis.averageOrderValue)}
          accent="#f09e64"
          helper="Avg per order"
        />
        <KpiCard
          label="Units Sold"
          value={scopedKpis.totalUnits.toLocaleString("en-IN")}
          accent="#f6cf88"
          helper={`${unitsPerOrder.toFixed(1)} units / order`}
        />
        <KpiCard
          label="Live Traffic"
          value={formatTrafficNumber(state.aggregateSnapshot.traffic.activeUsers)}
          accent="#e66f51"
          helper={`${state.aggregateSnapshot.traffic.delta >= 0 ? "+" : ""}${state.aggregateSnapshot.traffic.delta} vs last pulse`}
        />
      </section>

      <div className="overview-map-stage">
        <IndiaMapPanel markers={mapMarkers} />
      </div>
      <aside className="panel overview-feed-rail">
        <OrderFeed orders={state.recentOrders} streamStatus={state.streamStatus} />
      </aside>
    </div>
  );
}
