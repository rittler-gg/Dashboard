import { BreakdownChart } from "../components/BreakdownChart";
import { KpiCard } from "../components/KpiCard";
import type { DashboardState } from "../types/dashboard";
import { formatCompactNumber, formatCurrency } from "../utils/format";

interface BreakdownsPageProps {
  state: DashboardState;
}

export function BreakdownsPage({ state }: BreakdownsPageProps) {
  return (
    <div className="breakdowns-grid">
      <section className="breakdown-hero">
        <KpiCard
          label="Orders Captured"
          value={formatCompactNumber(state.kpis.totalOrders)}
          helper="Rolling mock event volume"
          accent="#f6cf88"
        />
        <KpiCard
          label="Revenue Captured"
          value={formatCurrency(state.kpis.totalRevenue)}
          helper="Derived from live order events"
          accent="#f09e64"
        />
        <KpiCard
          label="Active Users"
          value={formatCompactNumber(state.traffic.activeUsers)}
          helper="Real-time website pulse"
          accent="#de7057"
        />
      </section>

      <BreakdownChart
        title="Brand mix"
        eyebrow="Split by brand"
        items={state.breakdowns.brand}
        accent="linear-gradient(90deg, #f6cf88, #e4875d)"
      />
      <BreakdownChart
        title="Channel mix"
        eyebrow="Split by platform channel"
        items={state.breakdowns.channel}
        accent="linear-gradient(90deg, #eddcb6, #bc8e68)"
      />
      <BreakdownChart
        title="App vs Web"
        eyebrow="Split by device platform"
        items={state.breakdowns.platform}
        accent="linear-gradient(90deg, #f3bb7e, #c96a4f)"
      />
    </div>
  );
}
