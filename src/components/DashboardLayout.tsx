import { NavLink } from "react-router-dom";
import { useRef } from "react";
import type { PropsWithChildren } from "react";
import type { DashboardDateRange, DashboardState } from "../types/dashboard";
import { getStreamStatusLabel } from "../utils/streamStatus";

interface DashboardLayoutProps extends PropsWithChildren {
  state: DashboardState;
  dateRange: DashboardDateRange;
  fromLabel: string;
  toLabel: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}

export function DashboardLayout({
  children,
  state,
  dateRange,
  fromLabel,
  toLabel,
  onFromChange,
  onToChange,
}: DashboardLayoutProps) {
  const statusLabel = getStreamStatusLabel(state.streamStatus, "header");
  const fromInputRef = useRef<HTMLInputElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);

  const openPicker = (input: HTMLInputElement | null) => {
    if (!input) {
      return;
    }

    input.focus();
    input.showPicker?.();
  };

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <div>
          <p className="eyebrow">Econic commerce pulse</p>
          <h1>Econic Dashboard</h1>
        </div>

        <div className="topbar-actions">
          <section className="global-date-range" aria-label="Global dashboard date range">
            <div className="global-date-range-fields">
              <label
                className="time-range-field time-range-field-clickable"
                onClick={() => openPicker(fromInputRef.current)}
              >
                <span>From</span>
                <input
                  ref={fromInputRef}
                  className="time-range-input nav-time-range-input"
                  type="date"
                  value={dateRange.from}
                  max={dateRange.to}
                  onChange={(event) => onFromChange(event.target.value)}
                />
                <small>{fromLabel}</small>
              </label>
              <span className="global-date-separator" aria-hidden="true" />
              <label
                className="time-range-field time-range-field-clickable"
                onClick={() => openPicker(toInputRef.current)}
              >
                <span>To</span>
                <input
                  ref={toInputRef}
                  className="time-range-input nav-time-range-input"
                  type="date"
                  value={dateRange.to}
                  min={dateRange.from}
                  onChange={(event) => onToChange(event.target.value)}
                />
                <small>{toLabel}</small>
              </label>
            </div>
          </section>

          <nav className="route-switcher" aria-label="Dashboard views">
            <NavLink
              to="/overview"
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              Overview
            </NavLink>
            <NavLink
              to="/breakdowns"
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              Breakdowns
            </NavLink>
          </nav>

          <div className="status-cluster">
            <div className={`status-pill ${state.streamStatus}`}>
              <span className={`status-dot ${state.streamStatus}`} />
              {statusLabel}
            </div>
          </div>
        </div>
      </header>
      <main className="dashboard-content">{children}</main>
    </div>
  );
}
