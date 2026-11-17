import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AiAssistantPage } from "../pages/AiAssistant";
import { AssetsPage } from "../pages/Assets";
import { AttackSimulationPage } from "../pages/AttackSimulation";
import { NetworkMapPage } from "../pages/NetworkMap";
import { OverviewPage } from "../pages/Overview";
import { RemediationPage } from "../pages/Remediation";
import { ReportsPage } from "../pages/Reports";
import { VulnerabilitiesPage } from "../pages/Vulnerabilities";
import { Shell } from "./Shell";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<OverviewPage />} />
          <Route path="map" element={<NetworkMapPage />} />
          <Route path="assets" element={<AssetsPage />} />
          <Route path="simulate" element={<AttackSimulationPage />} />
          <Route path="vulnerabilities" element={<VulnerabilitiesPage />} />
          <Route path="assistant" element={<AiAssistantPage />} />
          <Route path="remediation" element={<RemediationPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
