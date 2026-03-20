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

export function OverviewPage({ state }: OverviewPageProps) {
  return (
    <div className="overview-grid">
      <IndiaMapPanel orders={state.orders} highlightedOrder={state.lastOrder} />
      <div className="overview-feed-overlay">
        <OrderFeed orders={state.orders} />
      </div>
      <aside className="overview-sidebar">
        <section className="kpi-grid">
          <KpiCard
            label="Total Orders"
            value={formatCompactNumber(state.kpis.totalOrders)}
            accent="#f7c66d"
            helper={`AOV ${formatCurrency(state.kpis.averageOrderValue)}`}
          />
          <KpiCard
            label="Total Revenue"
            value={formatDashboardRevenue(state.kpis.totalRevenue)}
            accent="#f3a86c"
            helper="Gross value from live stream"
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
