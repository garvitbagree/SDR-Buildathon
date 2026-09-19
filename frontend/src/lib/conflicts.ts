import type { Campaign, Channel } from "@/types";

export interface Touch {
  campaignId: string;
  channel: Channel;
  daysAgo: number;
}

export interface Prospect {
  id: string;
  name: string;
  title: string;
  company: string;
  campaignIds: string[];
  touches: Touch[];
  suppressed: boolean;
}

export type IssueKey = "suppressed" | "duplicate" | "overlap" | "frequency" | "instructions";
export type Severity = "high" | "medium" | "low";

export interface Issue {
  key: IssueKey;
  label: string;
  detail: string;
  severity: Severity;
}

export type ResolutionAction = "owner" | "cooldown" | "dnc" | "allow";

export interface Resolution {
  action: ResolutionAction;
  ownerId?: string;
  days?: number;
  note: string;
  by: string;
  time: string;
  prevCampaignIds: string[];
  prevSuppressed: boolean;
}

export interface Rules {
  maxTouches: number;
  duplicateWindow: number;
}

export interface ConflictItem {
  prospect: Prospect;
  issues: Issue[];
  severity: Severity;
}

export const DEFAULT_RULES: Rules = { maxTouches: 3, duplicateWindow: 3 };

export const severityRank: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

export const CHANNEL_LABEL: Record<Channel, string> = {
  linkedin: "LinkedIn",
  email: "Email",
  sms: "SMS",
  voice: "Voice",
};

const PAIR_CONFLICTS: Record<string, string> = {
  "c1|c3":
    "US SaaS CTO sends pricing questions to a human rep, while Voice AI Founders offers a demo and quotes self-serve pricing.",
  "c2|c3":
    "India BFSI CIO writes in a formal tone, while Voice AI Founders writes casually.",
};

export const activeCampaignIds = (p: Prospect, campaigns: Campaign[]) =>
  p.campaignIds.filter((id) => {
    const s = campaigns.find((c) => c.id === id)?.status;
    return s === "live" || s === "paused";
  });

export const recentCount = (p: Prospect, campaigns: Campaign[]) => {
  const active = activeCampaignIds(p, campaigns);
  return p.touches.filter((t) => t.daysAgo <= 7 && active.includes(t.campaignId)).length;
};

export function topSeverity(issues: Issue[]): Severity {
  return issues.reduce<Severity>(
    (top, i) => (severityRank[i.severity] > severityRank[top] ? i.severity : top),
    "low"
  );
}

export function detect(p: Prospect, campaigns: Campaign[], rules: Rules): Issue[] {
  const active = activeCampaignIds(p, campaigns);
  if (active.length === 0) return [];

  const name = (id: string) => campaigns.find((c) => c.id === id)?.name ?? "Unknown campaign";
  const issues: Issue[] = [];

  if (p.suppressed) {
    issues.push({
      key: "suppressed",
      label: "On do-not-contact list",
      detail: `This prospect opted out, but ${active.map(name).join(" and ")} can still contact them.`,
      severity: "high",
    });
  }

  const touches = p.touches.filter((t) => active.includes(t.campaignId));
  const dupes = new Set<string>();
  for (let i = 0; i < touches.length; i++) {
    for (let j = i + 1; j < touches.length; j++) {
      const a = touches[i];
      const b = touches[j];
      if (
        a.campaignId !== b.campaignId &&
        a.channel === b.channel &&
        Math.abs(a.daysAgo - b.daysAgo) <= rules.duplicateWindow
      ) {
        dupes.add(`${CHANNEL_LABEL[a.channel]} from ${name(a.campaignId)} and ${name(b.campaignId)}`);
      }
    }
  }
  if (dupes.size > 0) {
    issues.push({
      key: "duplicate",
      label: "Duplicate outreach",
      detail: `Same channel used by two campaigns within ${rules.duplicateWindow} days: ${[...dupes].join("; ")}.`,
      severity: "high",
    });
  }

  if (active.length > 1) {
    issues.push({
      key: "overlap",
      label: "In multiple campaigns",
      detail: `Targeted at the same time by ${active.map(name).join(" and ")}.`,
      severity: "medium",
    });
  }

  const recent = recentCount(p, campaigns);
  if (recent > rules.maxTouches) {
    issues.push({
      key: "frequency",
      label: "Too many touches",
      detail: `${recent} touches in the last 7 days. The limit is ${rules.maxTouches}.`,
      severity: "medium",
    });
  }

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const msg = PAIR_CONFLICTS[[active[i], active[j]].sort().join("|")];
      if (msg) {
        issues.push({
          key: "instructions",
          label: "Conflicting instructions",
          detail: msg,
          severity: "low",
        });
      }
    }
  }

  return issues;
}

export function recommend(
  p: Prospect,
  campaigns: Campaign[],
  issues: Issue[]
): { action: ResolutionAction; ownerId?: string } {
  if (issues.some((i) => i.key === "suppressed")) return { action: "dnc" };

  const active = activeCampaignIds(p, campaigns);
  if (active.length > 1) {
    const count = (id: string) => p.touches.filter((t) => t.campaignId === id).length;
    const best = active.reduce((a, b) => (count(b) > count(a) ? b : a), active[0]);
    return { action: "owner", ownerId: best };
  }
  return { action: "cooldown" };
}

export function applyResolution(
  p: Prospect,
  campaigns: Campaign[],
  action: ResolutionAction,
  ownerId?: string
): Prospect {
  const active = activeCampaignIds(p, campaigns);
  if (action === "owner" && ownerId) {
    return {
      ...p,
      campaignIds: p.campaignIds.filter((id) => id === ownerId || !active.includes(id)),
    };
  }
  if (action === "dnc") {
    return {
      ...p,
      suppressed: true,
      campaignIds: p.campaignIds.filter((id) => !active.includes(id)),
    };
  }
  return p;
}