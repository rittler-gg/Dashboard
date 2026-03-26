import { NavLink, useLocation } from "react-router-dom";
import { useRef } from "react";
import type { PropsWithChildren } from "react";
import type { DashboardDateRange } from "../types/dashboard";

interface DashboardLayoutProps extends PropsWithChildren {
  dateRange: DashboardDateRange;
  fromLabel: string;
  toLabel: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onFromTimeChange: (value: string) => void;
  onToTimeChange: (value: string) => void;
}

export function DashboardLayout({
  children,
  dateRange,
  fromLabel,
  toLabel,
  onFromChange,
  onToChange,
  onFromTimeChange,
  onToTimeChange,
}: DashboardLayoutProps) {
  const location = useLocation();
  const fromInputRef = useRef<HTMLInputElement>(null);
  const fromTimeInputRef = useRef<HTMLInputElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);
  const toTimeInputRef = useRef<HTMLInputElement>(null);
  const currentSearch = location.search;

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
          <nav className="route-switcher" aria-label="Dashboard views">
            <NavLink
              to={{ pathname: "/overview", search: currentSearch }}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              Overview
            </NavLink>
            <NavLink
              to={{ pathname: "/breakdowns", search: currentSearch }}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              Breakdowns
            </NavLink>
          </nav>

          <section className="global-date-range" aria-label="Global dashboard date range">
            <div className="global-date-range-fields">
              <label
                className="time-range-field time-range-field-clickable"
                onClick={() => openPicker(fromInputRef.current)}
              >
                <span>From</span>
                <div className="time-range-input-group">
                  <input
                    ref={fromInputRef}
                    className="time-range-input nav-time-range-input"
                    type="date"
                    value={dateRange.from}
                    max={dateRange.to}
                    onChange={(event) => onFromChange(event.target.value)}
                  />
                  <input
                    ref={fromTimeInputRef}
                    className="time-range-input nav-time-range-input nav-time-only-input"
                    type="time"
                    value={dateRange.fromTime}
                    onChange={(event) => onFromTimeChange(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                  />
                </div>
                <small>{fromLabel}</small>
              </label>
              <span className="global-date-separator" aria-hidden="true" />
              <label
                className="time-range-field time-range-field-clickable"
                onClick={() => openPicker(toInputRef.current)}
              >
                <span>To</span>
                <div className="time-range-input-group">
                  <input
                    ref={toInputRef}
                    className="time-range-input nav-time-range-input"
                    type="date"
                    value={dateRange.to}
                    min={dateRange.from}
                    onChange={(event) => onToChange(event.target.value)}
                  />
                  <input
                    ref={toTimeInputRef}
                    className="time-range-input nav-time-range-input nav-time-only-input"
                    type="time"
                    value={dateRange.toTime}
                    onChange={(event) => onToTimeChange(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                  />
                </div>
                <small>{toLabel}</small>
              </label>
            </div>
          </section>
        </div>
      </header>
      <main className="dashboard-content">{children}</main>
    </div>
  );
}
