import { createContext, useContext, useState, type ReactNode } from "react";
import type {
  AuditAction,
  AuditEntry,
  Campaign,
  CampaignStatus,
  NewCampaign,
  PromptScope,
  PromptVersion,
} from "@/types";
import { initialCampaigns } from "@/mocks/data";
import { initialAudit, initialPrompts } from "@/mocks/prompts";

interface ControlState {
  campaigns: Campaign[];
  killSwitch: boolean;
  setKillSwitch: (on: boolean) => void;
  setStatus: (id: string, status: CampaignStatus) => void;
  duplicateCampaign: (id: string) => void;
  addCampaign: (input: NewCampaign, systemPrompt: string, goLive: boolean) => string;
  updateCampaign: (id: string, patch: Partial<Campaign>) => void;
  toggleAgent: (id: string, agentKey: string) => void;
  toggleChannel: (id: string, channel: string) => void;
  prompts: PromptVersion[];
  audit: AuditEntry[];
  savePromptVersion: (campaignId: string, scope: PromptScope, content: string, note: string) => number;
  activatePromptVersion: (campaignId: string, scope: PromptScope, version: number) => void;
}

const ControlContext = createContext<ControlState | null>(null);

const CURRENT_USER = "Aarav Mehta";

const today = () => new Date().toISOString().slice(0, 10);

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const uid = (prefix: string) => `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

const emptyFunnel = {
  discovered: 0,
  researched: 0,
  qualified: 0,
  contacted: 0,
  engaged: 0,
  meeting: 0,
  opportunity: 0,
};

export function ControlProvider({ children }: { children: ReactNode }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [killSwitch, setKillSwitch] = useState(false);
  const [prompts, setPrompts] = useState<PromptVersion[]>(initialPrompts);
  const [audit, setAudit] = useState<AuditEntry[]>(initialAudit);

  const update = (id: string, fn: (c: Campaign) => Campaign) =>
    setCampaigns((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));

  const addAudit = (entry: Omit<AuditEntry, "id" | "author">) =>
    setAudit((prev) => [{ ...entry, id: uid("a"), author: CURRENT_USER }, ...prev]);

  const setStatus = (id: string, status: CampaignStatus) =>
    update(id, (c) => ({ ...c, status, updatedAt: today() }));

  const addCampaign = (input: NewCampaign, systemPrompt: string, goLive: boolean) => {
    const id = uid("c");
    const time = stamp();
    const text = systemPrompt.trim();

    const campaign: Campaign = {
      ...input,
      id,
      status: goLive && !killSwitch ? "live" : "draft",
      createdAt: today(),
      updatedAt: today(),
      activePromptVersion: text ? 1 : 0,
      funnel: { ...emptyFunnel },
      outreachCount: 0,
      meetings: 0,
    };

    setCampaigns((prev) => [...prev, campaign]);
    if (text) {
      setPrompts((prev) => [
        ...prev,
        {
          id: uid("p"),
          campaignId: id,
          agentKey: "system",
          version: 1,
          content: text,
          author: CURRENT_USER,
          createdAt: time,
          isActive: true,
          note: "Initial version",
        },
      ]);
      addAudit({ campaignId: id, scope: "system", action: "created", version: 1, time, note: "Initial version" });
    }
    return id;
  };

  const updateCampaign = (id: string, patch: Partial<Campaign>) =>
    update(id, (c) => ({ ...c, ...patch, updatedAt: today() }));

  const duplicateCampaign = (id: string) => {
    const src = campaigns.find((c) => c.id === id);
    if (!src) return;

    const newId = uid("c");
    const time = stamp();
    const cloned = prompts
      .filter((p) => p.campaignId === id && p.isActive)
      .map(
        (p): PromptVersion => ({
          id: uid("p"),
          campaignId: newId,
          agentKey: p.agentKey,
          version: 1,
          content: p.content,
          author: CURRENT_USER,
          createdAt: time,
          isActive: true,
          note: `Copied from ${src.name} v${p.version}`,
        })
      );

    const copy: Campaign = {
      ...src,
      id: newId,
      name: `${src.name} (copy)`,
      status: "draft",
      createdAt: today(),
      updatedAt: today(),
      activePromptVersion: cloned.some((p) => p.agentKey === "system") ? 1 : 0,
      agents: src.agents.map((a) => ({ ...a })),
      channels: src.channels.map((ch) => ({ ...ch })),
      funnel: { ...emptyFunnel },
      outreachCount: 0,
      meetings: 0,
    };

    setCampaigns((prev) => [...prev, copy]);
    setPrompts((prev) => [...prev, ...cloned]);
    setAudit((prev) => [
      ...cloned.map(
        (p): AuditEntry => ({
          id: uid("a"),
          campaignId: newId,
          scope: p.agentKey,
          action: "created",
          version: 1,
          author: CURRENT_USER,
          time,
          note: p.note,
        })
      ),
      ...prev,
    ]);
  };

  const toggleAgent = (id: string, agentKey: string) =>
    update(id, (c) => ({
      ...c,
      agents: c.agents.map((a) => (a.key === agentKey ? { ...a, paused: !a.paused } : a)),
    }));

  const toggleChannel = (id: string, channel: string) =>
    update(id, (c) => ({
      ...c,
      channels: c.channels.map((ch) =>
        ch.channel === channel ? { ...ch, paused: !ch.paused } : ch
      ),
    }));

  const savePromptVersion = (campaignId: string, scope: PromptScope, content: string, note: string) => {
    const existing = prompts.filter((p) => p.campaignId === campaignId && p.agentKey === scope);
    const version = existing.reduce((m, p) => Math.max(m, p.version), 0) + 1;
    const first = existing.length === 0;
    const time = stamp();

    setPrompts((prev) => [
      ...prev,
      {
        id: uid("p"),
        campaignId,
        agentKey: scope,
        version,
        content,
        author: CURRENT_USER,
        createdAt: time,
        isActive: first,
        note,
      },
    ]);
    if (first && scope === "system") {
      update(campaignId, (c) => ({ ...c, activePromptVersion: version, updatedAt: today() }));
    }
    addAudit({ campaignId, scope, action: "created", version, time, note });
    return version;
  };

  const activatePromptVersion = (campaignId: string, scope: PromptScope, version: number) => {
    const current = prompts.find(
      (p) => p.campaignId === campaignId && p.agentKey === scope && p.isActive
    );
    const action: AuditAction = current && version < current.version ? "rolled_back" : "activated";

    setPrompts((prev) =>
      prev.map((p) =>
        p.campaignId === campaignId && p.agentKey === scope
          ? { ...p, isActive: p.version === version }
          : p
      )
    );
    if (scope === "system") {
      update(campaignId, (c) => ({ ...c, activePromptVersion: version, updatedAt: today() }));
    }
    addAudit({ campaignId, scope, action, version, time: stamp(), note: "" });
  };

  return (
    <ControlContext.Provider
      value={{
        campaigns,
        killSwitch,
        setKillSwitch,
        setStatus,
        duplicateCampaign,
        addCampaign,
        updateCampaign,
        toggleAgent,
        toggleChannel,
        prompts,
        audit,
        savePromptVersion,
        activatePromptVersion,
      }}
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