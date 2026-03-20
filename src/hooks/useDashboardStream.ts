import { useEffect, useState } from "react";
import { mockDashboardDataSource } from "../data/mockDashboard";
import type { DashboardState } from "../types/dashboard";

export function useDashboardStream() {
  const [state, setState] = useState<DashboardState>(() =>
    mockDashboardDataSource.getInitialDashboardState(),
  );

  useEffect(() => {
    const unsubscribe = mockDashboardDataSource.subscribeToMockUpdates(setState);
    return unsubscribe;
  }, []);

  return state;
}
