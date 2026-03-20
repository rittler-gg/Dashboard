import { formatCompactNumber, formatCurrency } from "../utils/format";

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
}

export function BreakdownChart({
  title,
  eyebrow,
  items,
  accent,
}: BreakdownChartProps) {
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
        {items.map((item) => (
          <article className="breakdown-row" key={item.category}>
            <div className="breakdown-meta">
              <div>
                <strong>{item.category}</strong>
                <span>{formatCompactNumber(item.orders)} orders</span>
              </div>
              <em>{formatCurrency(item.revenue)}</em>
            </div>
            <div className="breakdown-bar-track">
              <div
                className="breakdown-bar-fill"
                style={{
                  width: `${Math.max((item.revenue / maxRevenue) * 100, 8)}%`,
                  background: accent,
                }}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
