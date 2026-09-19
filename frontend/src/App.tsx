import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ControlProvider } from "@/context/ControlContext";
import AppLayout from "@/layouts/AppLayout";
import Placeholder from "@/pages/Placeholder";
import Campaigns from "@/pages/Campaigns";
import CampaignDashboard from "@/pages/CampaignDashboard";
import CampaignForm from "@/pages/CampaignForm";
import PromptManager from "@/pages/PromptManager";

export default function App() {
  return (
    <ControlProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/campaigns" replace />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/campaigns/new" element={<CampaignForm />} />
            <Route path="/campaigns/:id/edit" element={<CampaignForm />} />
            <Route path="/campaigns/:id" element={<CampaignDashboard />} />
            <Route path="/prompts" element={<PromptManager />} />
            <Route path="/reps" element={<Placeholder title="Reps" />} />
            <Route path="/conflicts" element={<Placeholder title="Conflicts" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ControlProvider>
  );
}