import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ControlProvider } from "@/context/ControlContext";
import AppLayout from "@/layouts/AppLayout";
import Placeholder from "@/pages/Placeholder";
import Campaigns from "@/pages/Campaigns";

export default function App() {
  return (
    <ControlProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/campaigns" replace />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/campaigns/new" element={<Placeholder title="New campaign" />} />
            <Route path="/campaigns/:id/edit" element={<Placeholder title="Edit campaign" />} />
            <Route path="/campaigns/:id" element={<Placeholder title="Campaign dashboard" />} />
            <Route path="/prompts" element={<Placeholder title="Prompt manager" />} />
            <Route path="/reps" element={<Placeholder title="Reps" />} />
            <Route path="/conflicts" element={<Placeholder title="Conflicts" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ControlProvider>
  );
}