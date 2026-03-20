import { Navigate, Route, Routes } from "react-router-dom";
import { DashboardLayout } from "./components/DashboardLayout";
import { BreakdownsPage } from "./pages/BreakdownsPage";
import { OverviewPage } from "./pages/OverviewPage";
import { useDashboardStream } from "./hooks/useDashboardStream";

function App() {
  const state = useDashboardStream();

  return (
    <DashboardLayout state={state}>
      <Routes>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<OverviewPage state={state} />} />
        <Route path="/breakdowns" element={<BreakdownsPage state={state} />} />
      </Routes>
    </DashboardLayout>
  );
}

export default App;
