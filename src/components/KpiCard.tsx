import type { ReactNode } from "react";

interface KpiCardProps {
  label: string;
  value: string;
  accent?: string;
  helper?: string;
  icon?: ReactNode;
}

export function KpiCard({ label, value, accent, helper, icon }: KpiCardProps) {
  return (
    <article className="panel kpi-card">
      <div className="kpi-head">
        <span>{label}</span>
        {icon ? <div className="kpi-icon">{icon}</div> : null}
      </div>
      <strong
        className={value.length > 10 ? "kpi-value kpi-value-compact" : "kpi-value"}
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </strong>
      {helper ? <p>{helper}</p> : null}
    </article>
  );
}
