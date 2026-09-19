import { createContext, useContext, useState, type ReactNode } from "react";

export type IntegrationStatus = "connected" | "disconnected" | "error";

export interface Integration {
  id: string;
  name: string;
  purpose: string;
  status: IntegrationStatus;
  account: string;
  keyHint: string;
  lastSync: string;
  required: boolean;
  message?: string;
}

export interface ModelDef {
  id: string;
  name: string;
  provider: string;
  note: string;
  cost: "$" | "$$" | "$$$";
  speed: string;
  enabled: boolean;
}

export interface RoutingRule {
  task: string;
  hint: string;
  modelId: string;
}

export interface ToolDef {
  id: string;
  name: string;
  hint: string;
  enabled: boolean;
}

export interface Guardrail {
  id: string;
  label: string;
  hint: string;
  enabled: boolean;
  locked?: boolean;
}

export interface Policies {
  dailyCap: number;
  windowStart: number;
  windowEnd: number;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  docs: number;
  updated: string;
  enabled: boolean;
}

export interface Suppressed {
  id: string;
  value: string;
  type: "email" | "domain";
  reason: string;
  addedBy: string;
  addedAt: string;
}

export type Role = "admin" | "manager" | "viewer";

export interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export const CURRENT_USER_ID = "u1";

interface SettingsState {
  integrations: Integration[];
  connectIntegration: (id: string, account: string, key: string) => void;
  disconnectIntegration: (id: string) => void;

  models: ModelDef[];
  routing: RoutingRule[];
  tools: ToolDef[];
  setModelEnabled: (id: string, on: boolean) => void;
  setRouting: (task: string, modelId: string) => void;
  toggleTool: (id: string) => void;

  guardrails: Guardrail[];
  toggleGuardrail: (id: string) => void;
  policies: Policies;
  setPolicies: (patch: Partial<Policies>) => void;

  knowledge: KnowledgeBase[];
  toggleKb: (id: string) => void;
  addKb: (name: string, description: string) => void;
  removeKb: (id: string) => void;

  suppressed: Suppressed[];
  addSuppressed: (value: string, reason: string) => string;
  removeSuppressed: (id: string) => void;

  users: TeamUser[];
  auth: { sso: boolean; mfa: boolean };
  setAuth: (patch: Partial<{ sso: boolean; mfa: boolean }>) => void;
  inviteUser: (name: string, email: string, role: Role) => string;
  setUserRole: (id: string, role: Role) => void;
  removeUser: (id: string) => void;
}

const SettingsContext = createContext<SettingsState | null>(null);

const uid = (p: string) => `${p}${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const today = () => new Date().toISOString().slice(0, 10);

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

const initialIntegrations: Integration[] = [
  { id: "dronahq", name: "DronaHQ Agentic Platform", purpose: "Runs the agents and the vibe-coded apps", status: "connected", account: "Workspace: sdr-buildathon", keyHint: "••••8f2a", lastSync: "2 min ago", required: true },
  { id: "apollo", name: "Apollo.io", purpose: "Lead discovery and enrichment", status: "connected", account: "team@company.com", keyHint: "••••41c9", lastSync: "5 min ago", required: false },
  { id: "gmail", name: "Gmail", purpose: "Sends email and reads replies", status: "connected", account: "outreach@company.com", keyHint: "••••b7d0", lastSync: "1 min ago", required: false },
  { id: "twilio", name: "Twilio", purpose: "SMS and voice calls", status: "error", account: "Account AC••••92", keyHint: "••••3e11", lastSync: "3 hr ago", required: false, message: "Auth token was rejected. Reconnect to resume SMS and voice." },
  { id: "linkedin", name: "LinkedIn automation", purpose: "Connection requests and messages", status: "disconnected", account: "", keyHint: "", lastSync: "Never", required: false },
  { id: "crm", name: "CRM (Google Sheets)", purpose: "Logs every touch and outcome", status: "connected", account: "SDR Pipeline sheet", keyHint: "••••5a08", lastSync: "8 min ago", required: false },
  { id: "vector", name: "Vector database", purpose: "Stores knowledge for retrieval (RAG)", status: "connected", account: "pgvector, index: sdr-knowledge", keyHint: "••••c2f4", lastSync: "12 min ago", required: true },
];

const initialModels: ModelDef[] = [
  { id: "opus", name: "Claude Opus 5", provider: "Anthropic", note: "Most capable, best for judging and hard reasoning", cost: "$$$", speed: "Slower", enabled: true },
  { id: "sonnet", name: "Claude Sonnet 5", provider: "Anthropic", note: "Balanced quality, speed and cost", cost: "$$", speed: "Medium", enabled: true },
  { id: "haiku", name: "Claude Haiku 4.5", provider: "Anthropic", note: "Fast and cheap, good for simple decisions", cost: "$", speed: "Fastest", enabled: true },
];

const initialRouting: RoutingRule[] = [
  { task: "ICP fitment scoring", hint: "High volume, simple rubric", modelId: "haiku" },
  { task: "Reply classification", hint: "Positive, neutral or negative", modelId: "haiku" },
  { task: "Research summaries", hint: "Builds structured prospect context", modelId: "sonnet" },
  { task: "Outreach strategy", hint: "Decides channel, timing and approach", modelId: "sonnet" },
  { task: "Personalised email writing", hint: "Customer-facing, needs good tone", modelId: "sonnet" },
  { task: "Voice conversations", hint: "Low latency matters", modelId: "sonnet" },
  { task: "Evaluation (LLM as judge)", hint: "Scores outputs against the golden set", modelId: "opus" },
];

const initialTools: ToolDef[] = [
  { id: "rag", name: "Knowledge retrieval (RAG)", hint: "Search the knowledge bases before writing anything", enabled: true },
  { id: "web", name: "Web search", hint: "Look up recent company news", enabled: true },
  { id: "crm", name: "CRM read and write", hint: "Log touches and update stages", enabled: true },
  { id: "calendar", name: "Calendar booking", hint: "Book meetings with reps", enabled: true },
  { id: "email", name: "Send email", hint: "Outbound messages through Gmail", enabled: true },
  { id: "calls", name: "Place calls", hint: "Outbound voice through Twilio", enabled: true },
];

const initialGuardrails: Guardrail[] = [
  { id: "g-dnc", label: "Respect the do-not-contact list", hint: "No agent can contact a suppressed prospect, whatever the campaign says", enabled: true, locked: true },
  { id: "g-ground", label: "Ground claims in the knowledge base", hint: "Product claims must come from retrieved sources. Ungrounded claims are blocked.", enabled: true },
  { id: "g-price", label: "Block unapproved pricing and discounts", hint: "Agents cannot quote prices or offer discounts without a human", enabled: true },
  { id: "g-scan", label: "Scan outgoing messages", hint: "Catch legal claims, competitor attacks and personal data before sending", enabled: true },
  { id: "g-conf", label: "Escalate when confidence is low", hint: "Uses each campaign's confidence threshold", enabled: true },
  { id: "g-stop", label: "Stop after 3 unanswered follow-ups", hint: "Prevents chasing prospects who are not replying", enabled: true },
];

const initialKnowledge: KnowledgeBase[] = [
  { id: "kb1", name: "Product and company information", description: "Features, pricing tiers, positioning, security and compliance answers", docs: 24, updated: "2026-09-16", enabled: true },
  { id: "kb2", name: "Customer case studies", description: "Outcomes by industry and company size", docs: 12, updated: "2026-09-15", enabled: true },
  { id: "kb3", name: "Sales playbooks and objections", description: "Approved responses to common objections", docs: 18, updated: "2026-09-14", enabled: true },
  { id: "kb4", name: "Example emails and messages", description: "High quality outreach for different scenarios", docs: 40, updated: "2026-09-17", enabled: true },
  { id: "kb5", name: "Voice call scripts", description: "Call flows and sample conversations", docs: 9, updated: "2026-09-13", enabled: true },
];

const initialSuppressed: Suppressed[] = [
  { id: "s1", value: "chris.wu@pulsevoice.com", type: "email", reason: "Opted out by reply", addedBy: "Conversation Agent", addedAt: "2026-09-18" },
  { id: "s2", value: "competitorco.com", type: "domain", reason: "Competitor", addedBy: "Priya Nair", addedAt: "2026-09-09" },
  { id: "s3", value: "bigcustomer.io", type: "domain", reason: "Existing customer, handled by the account team", addedBy: "Aarav Mehta", addedAt: "2026-09-10" },
];

const initialUsers: TeamUser[] = [
  { id: "u1", name: "Aarav Mehta", email: "aarav@company.com", role: "admin" },
  { id: "u2", name: "Priya Nair", email: "priya@company.com", role: "manager" },
  { id: "u3", name: "Meera Shah", email: "meera@company.com", role: "viewer" },
];

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [models, setModels] = useState(initialModels);
  const [routing, setRoutingState] = useState(initialRouting);
  const [tools, setTools] = useState(initialTools);
  const [guardrails, setGuardrails] = useState(initialGuardrails);
  const [policies, setPoliciesState] = useState<Policies>({ dailyCap: 500, windowStart: 8, windowEnd: 20 });
  const [knowledge, setKnowledge] = useState(initialKnowledge);
  const [suppressed, setSuppressed] = useState(initialSuppressed);
  const [users, setUsers] = useState(initialUsers);
  const [auth, setAuthState] = useState({ sso: true, mfa: false });

  const connectIntegration = (id: string, account: string, key: string) =>
    setIntegrations((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              status: "connected",
              account: account.trim(),
              keyHint: `••••${key.trim().slice(-4)}`,
              lastSync: "Just now",
              message: undefined,
            }
          : i
      )
    );

  const disconnectIntegration = (id: string) =>
    setIntegrations((prev) =>
      prev.map((i) =>
        i.id === id && !i.required
          ? { ...i, status: "disconnected", account: "", keyHint: "", lastSync: "Never", message: undefined }
          : i
      )
    );

  const setModelEnabled = (id: string, on: boolean) =>
    setModels((prev) => prev.map((m) => (m.id === id ? { ...m, enabled: on } : m)));

  const setRouting = (task: string, modelId: string) =>
    setRoutingState((prev) => prev.map((r) => (r.task === task ? { ...r, modelId } : r)));

  const toggleTool = (id: string) =>
    setTools((prev) => prev.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)));

  const toggleGuardrail = (id: string) =>
    setGuardrails((prev) =>
      prev.map((g) => (g.id === id && !g.locked ? { ...g, enabled: !g.enabled } : g))
    );

  const setPolicies = (patch: Partial<Policies>) => setPoliciesState((p) => ({ ...p, ...patch }));

  const toggleKb = (id: string) =>
    setKnowledge((prev) => prev.map((k) => (k.id === id ? { ...k, enabled: !k.enabled } : k)));

  const addKb = (name: string, description: string) =>
    setKnowledge((prev) => [
      ...prev,
      { id: uid("kb"), name: name.trim(), description: description.trim(), docs: 0, updated: today(), enabled: true },
    ]);

  const removeKb = (id: string) => setKnowledge((prev) => prev.filter((k) => k.id !== id));

  const addSuppressed = (value: string, reason: string) => {
    const v = value.trim().toLowerCase();
    if (!v) return "Enter an email or a domain";
    const isEmail = v.includes("@");
    if (isEmail && !EMAIL_RE.test(v)) return "That is not a valid email";
    if (!isEmail && !DOMAIN_RE.test(v)) return "That is not a valid domain, for example example.com";
    if (suppressed.some((s) => s.value === v)) return "Already on the list";
    const me = users.find((u) => u.id === CURRENT_USER_ID);
    setSuppressed((prev) => [
      {
        id: uid("s"),
        value: v,
        type: isEmail ? "email" : "domain",
        reason: reason.trim() || "Added manually",
        addedBy: me?.name ?? "Admin",
        addedAt: today(),
      },
      ...prev,
    ]);
    return "";
  };

  const removeSuppressed = (id: string) => setSuppressed((prev) => prev.filter((s) => s.id !== id));

  const setAuth = (patch: Partial<{ sso: boolean; mfa: boolean }>) =>
    setAuthState((a) => ({ ...a, ...patch }));

  const inviteUser = (name: string, email: string, role: Role) => {
    const e = email.trim().toLowerCase();
    if (!name.trim()) return "Enter a name";
    if (!EMAIL_RE.test(e)) return "Enter a valid email";
    if (users.some((u) => u.email.toLowerCase() === e)) return "This email is already on the team";
    setUsers((prev) => [...prev, { id: uid("u"), name: name.trim(), email: e, role }]);
    return "";
  };

  const setUserRole = (id: string, role: Role) =>
    setUsers((prev) => prev.map((u) => (u.id === id && u.id !== CURRENT_USER_ID ? { ...u, role } : u)));

  const removeUser = (id: string) =>
    setUsers((prev) => prev.filter((u) => u.id !== id || u.id === CURRENT_USER_ID));

  return (
    <SettingsContext.Provider
      value={{
        integrations,
        connectIntegration,
        disconnectIntegration,
        models,
        routing,
        tools,
        setModelEnabled,
        setRouting,
        toggleTool,
        guardrails,
        toggleGuardrail,
        policies,
        setPolicies,
        knowledge,
        toggleKb,
        addKb,
        removeKb,
        suppressed,
        addSuppressed,
        removeSuppressed,
        users,
        auth,
        setAuth,
        inviteUser,
        setUserRole,
        removeUser,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}