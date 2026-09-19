export type CampaignStatus = "draft" | "live" | "paused" | "completed" | "archived";

export type Channel = "linkedin" | "email" | "sms" | "voice";

export type AgentKey =
  | "icp_fitment"
  | "research"
  | "strategy"
  | "personalisation"
  | "conversation"
  | "voice"
  | "followup";

export interface AgentConfig {
  key: AgentKey;
  name: string;
  enabled: boolean;
  paused: boolean;
}

export interface ChannelConfig {
  channel: Channel;
  enabled: boolean;
  paused: boolean;
  dailyLimit: number;
}

export interface Funnel {
  discovered: number;
  researched: number;
  qualified: number;
  contacted: number;
  engaged: number;
  meeting: number;
  opportunity: number;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  owner: string;
  status: CampaignStatus;
  icp: string;
  geography: string;
  targetRoles: string[];
  createdAt: string;
  updatedAt: string;
  activePromptVersion: number;
  agents: AgentConfig[];
  channels: ChannelConfig[];
  funnel: Funnel;
  outreachCount: number;
  meetings: number;
  repIds: string[];
}

export interface PromptVersion {
  id: string;
  campaignId: string;
  agentKey: AgentKey | "system";
  version: number;
  content: string;
  author: string;
  createdAt: string;
  isActive: boolean;
  note: string;
}

export interface Rep {
  id: string;
  name: string;
  email: string;
  status: "active" | "offboarded";
  dailyLimit: number;
  workingHours: string;
  channels: Channel[];
  campaignIds: string[];
}

export type ActivityStatus = "completed" | "failed" | "pending_approval" | "escalated";

export interface ActivityEvent {
  id: string;
  campaignId: string;
  agentKey: AgentKey;
  action: string;
  channel: Channel | null;
  promptVersion: number;
  time: string;
  status: ActivityStatus;
}

export interface CampaignStats {
  outreach: Record<Channel, number>;
  followups: number;
  outcomes: { positive: number; negative: number; neutral: number };
  workflows: { active: number; completed: number; failed: number };
}

export type PromptScope = AgentKey | "system";

export type AuditAction = "created" | "activated" | "rolled_back";

export interface AuditEntry {
  id: string;
  campaignId: string;
  scope: PromptScope;
  action: AuditAction;
  version: number;
  author: string;
  time: string;
  note: string;
}