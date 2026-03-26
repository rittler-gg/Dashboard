import { useMemo } from "react";
import { BreakdownChart } from "../components/BreakdownChart";
import { KpiCard } from "../components/KpiCard";
import type {
  Brand,
  BrandHourlyPoint,
  DashboardState,
} from "../types/dashboard";
import {
  formatCompactNumber,
  formatTrafficNumber,
  formatDashboardRevenue,
} from "../utils/format";

interface BreakdownsPageProps {
  state: DashboardState;
}

function buildBrandSparklineSeries(points: BrandHourlyPoint[]) {
  const byBrand = new Map<Brand, number[]>();

  for (const point of points) {
    const series = byBrand.get(point.brand) ?? [];
    series.push(point.orders);
    byBrand.set(point.brand, series);
  }

  return Object.fromEntries(byBrand.entries());
}

export function BreakdownsPage({ state }: BreakdownsPageProps) {
  const visibleBrandMix = useMemo(
    () =>
      state.aggregateSnapshot.breakdowns.brand.filter(
        (item) => item.category !== "Other" && item.category !== "Unknown",
      ),
    [state.aggregateSnapshot.breakdowns.brand],
  );
  const visibleChannelMix = useMemo(
    () =>
      state.aggregateSnapshot.breakdowns.channel.filter(
        (item) => item.category !== "Other" && item.category !== "Unknown",
      ),
    [state.aggregateSnapshot.breakdowns.channel],
  );
  const visiblePlatformMix = useMemo(
    () =>
      state.aggregateSnapshot.breakdowns.platform.filter(
        (item) => item.category !== "Other" && item.category !== "Unknown",
      ),
    [state.aggregateSnapshot.breakdowns.platform],
  );
  const brandSparklineSeries = useMemo(
    () => buildBrandSparklineSeries(state.aggregateSnapshot.brandHourly),
    [state.aggregateSnapshot.brandHourly],
  );

  return (
    <div className="breakdowns-grid">
      <section className="breakdown-hero">
        <KpiCard
          label="Orders Captured"
          value={formatCompactNumber(state.aggregateSnapshot.kpis.totalOrders)}
          helper="Aggregate snapshot volume"
          accent="#f6cf88"
        />
        <KpiCard
          label="Revenue Captured"
          value={formatDashboardRevenue(state.aggregateSnapshot.kpis.totalRevenue)}
          helper="Snapshot-backed revenue total"
          accent="#f09e64"
        />
        <KpiCard
          label="Active Users"
          value={formatTrafficNumber(state.aggregateSnapshot.traffic.activeUsers)}
          helper="Real-time website pulse"
          accent="#de7057"
        />
      </section>

      <BreakdownChart
        title="Brand mix"
        eyebrow="Split by brand"
        items={visibleBrandMix}
        accent="linear-gradient(90deg, #f6cf88, #e4875d)"
        sparklineSeries={brandSparklineSeries}
      />
      <BreakdownChart
        title="Channel mix"
        eyebrow="Split by platform channel"
        items={visibleChannelMix}
        accent="linear-gradient(90deg, #eddcb6, #bc8e68)"
      />
      <BreakdownChart
        title="App vs Web"
        eyebrow="Split by device platform"
        items={visiblePlatformMix}
        accent="linear-gradient(90deg, #f3bb7e, #c96a4f)"
      />
    </div>
  );
}
