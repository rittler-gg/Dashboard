import { Navigate, Route, Routes } from "react-router-dom";
import { DashboardLayout } from "./components/DashboardLayout";
import { BreakdownsPage } from "./pages/BreakdownsPage";
import { OverviewPage } from "./pages/OverviewPage";
import { useDashboardDateRange } from "./hooks/useDashboardDateRange";
import { useDashboardStream } from "./hooks/useDashboardStream";

function App() {
  const { dateRange, setFrom, setTo, fromLabel, toLabel } = useDashboardDateRange();
  const state = useDashboardStream(dateRange);

  return (
    <DashboardLayout
      state={state}
      dateRange={dateRange}
      fromLabel={fromLabel}
      toLabel={toLabel}
      onFromChange={setFrom}
      onToChange={setTo}
    >
      <Routes>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<OverviewPage state={state} dateRange={dateRange} />} />
        <Route
          path="/breakdowns"
          element={<BreakdownsPage state={state} />}
        />
      </Routes>
    </DashboardLayout>
  );
}

export default App;
