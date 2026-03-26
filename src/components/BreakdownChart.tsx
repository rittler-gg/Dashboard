import { formatCompactNumber, formatDashboardRevenue } from "../utils/format";

interface BreakdownItem {
  category: string;
  orders: number;
  revenue: number;
}

interface BreakdownChartProps {
  title: string;
  eyebrow: string;
  items: BreakdownItem[];
  accent: string;
  sparklineSeries?: Record<string, number[]>;
}

function Sparkline({ points, accent }: { points: number[]; accent: string }) {
  const safePoints = points.length > 0 ? points : [0];
  const width = 80;
  const height = 24;
  const maxValue = Math.max(...safePoints, 1);
  const pointString = safePoints
    .map((point, index) => {
      const x = safePoints.length === 1 ? width / 2 : (index / (safePoints.length - 1)) * width;
      const y = height - (point / maxValue) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg className="brand-sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={pointString} fill="none" stroke={accent} strokeWidth="1.75" />
    </svg>
  );
}

export function BreakdownChart({
  title,
  eyebrow,
  items,
  accent,
  sparklineSeries,
}: BreakdownChartProps) {
  const totalOrders = items.reduce((sum, item) => sum + item.orders, 0);
  const totalRevenue = items.reduce((sum, item) => sum + item.revenue, 0);
  const maxRevenue = Math.max(...items.map((item) => item.revenue), 1);

  return (
    <section className="panel breakdown-panel">
      <div className="panel-header compact">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
      </div>

      <div className="breakdown-list">
        {items.map((item) => {
          const revenueShare =
            totalRevenue === 0 ? 0 : Math.round((item.revenue / totalRevenue) * 100);
          const barWidth =
            item.revenue === 0 ? 0 : Math.max((item.revenue / maxRevenue) * 100, 8);
          const sparkline = sparklineSeries?.[item.category];

          return (
            <article className="breakdown-row" key={item.category}>
              <div className="breakdown-meta">
                <div className="breakdown-label-group">
                  <strong>{item.category}</strong>
                  <span>{formatCompactNumber(item.orders)} orders</span>
                </div>
                {sparkline ? <Sparkline points={sparkline} accent={accent.includes("#") ? accent.split(",")[0].replace("linear-gradient(90deg, ", "") : "#f6cf88"} /> : null}
                <em>{formatDashboardRevenue(item.revenue)}</em>
              </div>
              <div className="breakdown-progress-row">
                <div className="breakdown-bar-track">
                  <div
                    className="breakdown-bar-fill"
                    style={{
                      width: `${barWidth}%`,
                      background: accent,
                    }}
                  />
                </div>
                <span className="breakdown-share">{revenueShare}%</span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="breakdown-total-row">
        <strong>Total</strong>
        <span>{formatCompactNumber(totalOrders)} orders</span>
        <em>{formatDashboardRevenue(totalRevenue)}</em>
      </div>
    </section>
  );
}
