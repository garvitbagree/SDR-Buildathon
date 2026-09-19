import { createContext, useContext, useState, type ReactNode } from "react";
import type { Campaign, CampaignStatus } from "@/types";
import { initialCampaigns } from "@/mocks/data";

interface ControlState {
  campaigns: Campaign[];
  killSwitch: boolean;
  setKillSwitch: (on: boolean) => void;
  setStatus: (id: string, status: CampaignStatus) => void;
  toggleAgent: (id: string, agentKey: string) => void;
  toggleChannel: (id: string, channel: string) => void;
}

const ControlContext = createContext<ControlState | null>(null);

export function ControlProvider({ children }: { children: ReactNode }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [killSwitch, setKillSwitch] = useState(false);

  const update = (id: string, fn: (c: Campaign) => Campaign) =>
    setCampaigns((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));

  const setStatus = (id: string, status: CampaignStatus) =>
    update(id, (c) => ({ ...c, status, updatedAt: new Date().toISOString().slice(0, 10) }));

  const toggleAgent = (id: string, agentKey: string) =>
    update(id, (c) => ({
      ...c,
      agents: c.agents.map((a) => (a.key === agentKey ? { ...a, paused: !a.paused } : a)),
    }));

  const toggleChannel = (id: string, channel: string) =>
    update(id, (c) => ({
      ...c,
      channels: c.channels.map((ch) => (ch.channel === channel ? { ...ch, paused: !ch.paused } : ch)),
    }));

  return (
    <ControlContext.Provider
      value={{ campaigns, killSwitch, setKillSwitch, setStatus, toggleAgent, toggleChannel }}
    >
      {children}
    </ControlContext.Provider>
  );
}

export function useControl() {
  const ctx = useContext(ControlContext);
  if (!ctx) throw new Error("useControl must be used inside ControlProvider");
  return ctx;
}