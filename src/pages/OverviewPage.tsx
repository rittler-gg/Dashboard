import { IndiaMapPanel } from "../components/IndiaMapPanel";
import { KpiCard } from "../components/KpiCard";
import { OrderFeed } from "../components/OrderFeed";
import type { DashboardDateRange, DashboardState } from "../types/dashboard";
import {
  formatTrafficNumber,
  formatCurrency,
  formatDashboardRevenue,
} from "../utils/format";

interface OverviewPageProps {
  state: DashboardState;
  dateRange: DashboardDateRange;
}

export function OverviewPage({ state }: OverviewPageProps) {
  const scopedKpis = state.aggregateSnapshot.kpis;
  const unitsPerOrder =
    scopedKpis.totalOrders === 0 ? 0 : state.aggregateSnapshot.kpis.totalUnits / scopedKpis.totalOrders;

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
        <IndiaMapPanel markers={state.activeMapMarkers} />
      </div>
      <aside className="panel overview-feed-rail">
        <OrderFeed orders={state.recentOrders} streamStatus={state.streamStatus} />
      </aside>
    </div>
  );
}
