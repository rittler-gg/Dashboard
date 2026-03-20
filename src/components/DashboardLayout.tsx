import { NavLink } from "react-router-dom";
import type { PropsWithChildren } from "react";
import type { DashboardState } from "../types/dashboard";

interface DashboardLayoutProps extends PropsWithChildren {
  state: DashboardState;
}

export function DashboardLayout({ children, state }: DashboardLayoutProps) {
  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <div>
          <p className="eyebrow">Econic commerce pulse</p>
          <h1> Econic Dashboard</h1>
        </div>

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
          <div className="status-pill">
            <span
              className={state.streamStatus === "live" ? "status-dot live" : "status-dot"}
            />
            {state.streamStatus === "live" ? "Live stream" : "Connecting"}
          </div>
        </div>
      </header>
      <main className="dashboard-content">{children}</main>
    </div>
  );
}
