import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useControl } from "@/context/ControlContext";
import { initialProspects } from "@/mocks/prospects";
import {
  DEFAULT_RULES,
  applyResolution,
  detect,
  severityRank,
  topSeverity,
  type ConflictItem,
  type Prospect,
  type Resolution,
  type ResolutionAction,
  type Rules,
} from "@/lib/conflicts";

interface ResolvedItem {
  prospect: Prospect;
  resolution: Resolution;
}

interface ConflictState {
  monitored: number;
  rules: Rules;
  setRules: (r: Rules) => void;
  open: ConflictItem[];
  openCount: number;
  resolved: ResolvedItem[];
  resolve: (
    prospectId: string,
    action: ResolutionAction,
    opts: { ownerId?: string; days?: number; note: string }
  ) => void;
  reopen: (prospectId: string) => void;
}

const ConflictContext = createContext<ConflictState | null>(null);

const CURRENT_USER = "Aarav Mehta";

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function ConflictProvider({ children }: { children: ReactNode }) {
  const { campaigns } = useControl();
  const [prospects, setProspects] = useState<Prospect[]>(initialProspects);
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});

  const open = useMemo(
    () =>
      prospects
        .filter((p) => !resolutions[p.id])
        .map((p): ConflictItem => {
          const issues = detect(p, campaigns, rules);
          return { prospect: p, issues, severity: topSeverity(issues) };
        })
        .filter((i) => i.issues.length > 0)
        .sort((a, b) => severityRank[b.severity] - severityRank[a.severity]),
    [prospects, resolutions, campaigns, rules]
  );

  const resolved = useMemo(
    () =>
      prospects
        .filter((p) => resolutions[p.id])
        .map((p): ResolvedItem => ({ prospect: p, resolution: resolutions[p.id] }))
        .sort((a, b) => b.resolution.time.localeCompare(a.resolution.time)),
    [prospects, resolutions]
  );

  const resolve: ConflictState["resolve"] = (id, action, opts) => {
    const p = prospects.find((x) => x.id === id);
    if (!p) return;
    setResolutions((prev) => ({
      ...prev,
      [id]: {
        action,
        ownerId: opts.ownerId,
        days: opts.days,
        note: opts.note,
        by: CURRENT_USER,
        time: stamp(),
        prevCampaignIds: p.campaignIds,
        prevSuppressed: p.suppressed,
      },
    }));
    setProspects((prev) =>
      prev.map((x) => (x.id === id ? applyResolution(x, campaigns, action, opts.ownerId) : x))
    );
  };

  const reopen = (id: string) => {
    const r = resolutions[id];
    if (!r) return;
    setProspects((prev) =>
      prev.map((x) =>
        x.id === id ? { ...x, campaignIds: r.prevCampaignIds, suppressed: r.prevSuppressed } : x
      )
    );
    setResolutions((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  return (
    <ConflictContext.Provider
      value={{
        monitored: prospects.length,
        rules,
        setRules,
        open,
        openCount: open.length,
        resolved,
        resolve,
        reopen,
      }}
    >
      {children}
    </ConflictContext.Provider>
  );
}

export function useConflicts() {
  const ctx = useContext(ConflictContext);
  if (!ctx) throw new Error("useConflicts must be used inside ConflictProvider");
  return ctx;
}