import type { AuditEntry, PromptVersion } from "@/types";

export const initialPrompts: PromptVersion[] = [
  // c1: US SaaS CTO
  { id: "p-c1-s1", campaignId: "c1", agentKey: "system", version: 1, content: "You are an SDR for our product. Be concise and helpful.", author: "Aarav Mehta", createdAt: "2026-09-10 11:20", isActive: false, note: "Initial draft" },
  { id: "p-c1-s2", campaignId: "c1", agentKey: "system", version: 2, content: "You are an SDR selling to US SaaS CTOs.\nLead with engineering productivity.\nNever claim features we do not have.", author: "Aarav Mehta", createdAt: "2026-09-14 15:05", isActive: false, note: "Added ICP and guardrail" },
  { id: "p-c1-s3", campaignId: "c1", agentKey: "system", version: 3, content: "You are an SDR selling to US SaaS CTOs.\nLead with engineering productivity and cite a relevant case study retrieved from the knowledge base.\nNever claim features we do not have.\nEscalate pricing questions to a human rep.", author: "Priya Nair", createdAt: "2026-09-18 16:40", isActive: true, note: "Added RAG citation and escalation rule" },
  { id: "p-c1-p1", campaignId: "c1", agentKey: "personalisation", version: 1, content: "Write a short email that references the prospect's role and company.\nKeep it under 120 words.", author: "Aarav Mehta", createdAt: "2026-09-11 10:00", isActive: false, note: "First version" },
  { id: "p-c1-p2", campaignId: "c1", agentKey: "personalisation", version: 2, content: "Write a short email that references the prospect's role, company and one recent public signal from the research notes.\nKeep it under 120 words.\nEnd with a single low-pressure question.\nNever invent facts that are not in the research notes.", author: "Aarav Mehta", createdAt: "2026-09-16 12:30", isActive: true, note: "Grounded in research notes" },
  { id: "p-c1-c1", campaignId: "c1", agentKey: "conversation", version: 1, content: "Read the reply and classify it as positive, neutral or negative.\nIf the prospect asks about pricing or a contract, escalate to a human rep.\nIf they ask to stop, add them to the do-not-contact list.", author: "Priya Nair", createdAt: "2026-09-12 09:15", isActive: true, note: "Reply handling rules" },

  // c2: India BFSI CIO
  { id: "p-c2-s1", campaignId: "c2", agentKey: "system", version: 1, content: "You are an SDR for our product selling to banks and insurers in India. Be formal and concise.", author: "Priya Nair", createdAt: "2026-09-08 14:00", isActive: false, note: "Initial draft" },
  { id: "p-c2-s2", campaignId: "c2", agentKey: "system", version: 2, content: "You are an SDR selling to CIOs and heads of IT at Indian banks, insurers and NBFCs.\nBe formal and concise.\nAddress data residency and RBI compliance concerns using approved answers from the knowledge base.\nNever claim certifications we do not hold.", author: "Priya Nair", createdAt: "2026-09-15 17:20", isActive: true, note: "Added compliance handling" },
  { id: "p-c2-p1", campaignId: "c2", agentKey: "personalisation", version: 1, content: "Write a formal email to a BFSI technology leader.\nReference a compliance or modernisation priority from the research notes.\nKeep it under 130 words.", author: "Priya Nair", createdAt: "2026-09-09 11:45", isActive: true, note: "First version" },

  // c3: Voice AI Founders
  { id: "p-c3-s1", campaignId: "c3", agentKey: "system", version: 1, content: "You are an SDR reaching founders of early stage Voice AI startups.\nBe casual and direct.\nLead with latency and cost per minute.\nOffer a short demo call as the next step.", author: "Aarav Mehta", createdAt: "2026-09-12 13:10", isActive: true, note: "Initial version" },
  { id: "p-c3-v1", campaignId: "c3", agentKey: "voice", version: 1, content: "Open by confirming you are speaking to the right person.\nQualify on stage, team size and current voice stack.\nIf the prospect asks for a human, transfer the call immediately.", author: "Aarav Mehta", createdAt: "2026-09-12 13:40", isActive: true, note: "Call flow" },

  // c4: Enterprise Expansion
  { id: "p-c4-s1", campaignId: "c4", agentKey: "system", version: 1, content: "You are an account manager assistant reaching existing customers about expansion.\nReference their current plan and usage from the CRM notes.\nNever offer discounts without human approval.", author: "Priya Nair", createdAt: "2026-09-17 10:30", isActive: true, note: "Initial draft" },
];

export const initialAudit: AuditEntry[] = initialPrompts
  .flatMap((p): AuditEntry[] => {
    const created: AuditEntry = {
      id: `a-c-${p.id}`,
      campaignId: p.campaignId,
      scope: p.agentKey,
      action: "created",
      version: p.version,
      author: p.author,
      time: p.createdAt,
      note: p.note,
    };
    return p.isActive && p.version > 1
      ? [created, { ...created, id: `a-a-${p.id}`, action: "activated", note: "" }]
      : [created];
  })
  .sort((a, b) => b.time.localeCompare(a.time));