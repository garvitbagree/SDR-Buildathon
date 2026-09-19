import type { ActivityEvent, CampaignStats } from "@/types";

export const emptyStats: CampaignStats = {
  outreach: { linkedin: 0, email: 0, sms: 0, voice: 0 },
  followups: 0,
  outcomes: { positive: 0, negative: 0, neutral: 0 },
  workflows: { active: 0, completed: 0, failed: 0 },
};

export const campaignStats: Record<string, CampaignStats> = {
  c1: {
    outreach: { linkedin: 150, email: 210, sms: 30, voice: 36 },
    followups: 118,
    outcomes: { positive: 52, negative: 21, neutral: 15 },
    workflows: { active: 14, completed: 392, failed: 9 },
  },
  c2: {
    outreach: { linkedin: 70, email: 120, sms: 0, voice: 21 },
    followups: 64,
    outcomes: { positive: 24, negative: 10, neutral: 6 },
    workflows: { active: 6, completed: 205, failed: 4 },
  },
  c3: {
    outreach: { linkedin: 45, email: 70, sms: 0, voice: 27 },
    followups: 39,
    outcomes: { positive: 19, negative: 7, neutral: 5 },
    workflows: { active: 8, completed: 133, failed: 3 },
  },
};

export const activityEvents: ActivityEvent[] = [
  // c1: US SaaS CTO (prompt v3 is active)
  { id: "e1", campaignId: "c1", agentKey: "personalisation", action: "Drafted email to Dana Whitfield (CTO, Northwind Labs)", channel: "email", promptVersion: 3, time: "3 min ago", status: "completed" },
  { id: "e2", campaignId: "c1", agentKey: "conversation", action: "Marcus Lee asked about pricing, handed to a human rep", channel: "email", promptVersion: 3, time: "12 min ago", status: "escalated" },
  { id: "e3", campaignId: "c1", agentKey: "strategy", action: "Chose LinkedIn first for Priya Raman (VP Eng, Stackly)", channel: "linkedin", promptVersion: 3, time: "25 min ago", status: "completed" },
  { id: "e4", campaignId: "c1", agentKey: "icp_fitment", action: "Rejected Orbit Foods: not a SaaS company", channel: null, promptVersion: 3, time: "41 min ago", status: "completed" },
  { id: "e5", campaignId: "c1", agentKey: "personalisation", action: "Email to Tom Becker cites a case study, waiting for review", channel: "email", promptVersion: 3, time: "1 hr ago", status: "pending_approval" },
  { id: "e6", campaignId: "c1", agentKey: "research", action: "Enrichment failed for Helio Systems: Apollo rate limit", channel: null, promptVersion: 2, time: "2 hr ago", status: "failed" },
  { id: "e7", campaignId: "c1", agentKey: "followup", action: "Scheduled day-3 follow-up to Jenna Cole", channel: "email", promptVersion: 2, time: "3 hr ago", status: "completed" },

  // c2: India BFSI CIO (paused, so the latest activity is older)
  { id: "e8", campaignId: "c2", agentKey: "conversation", action: "Positive reply from Anil Deshmukh (CIO, Meridian Bank), meeting proposed", channel: "email", promptVersion: 2, time: "Yesterday, 4:12 PM", status: "completed" },
  { id: "e9", campaignId: "c2", agentKey: "voice", action: "Call with Kavita Rao (Head of IT, SafeLife): handled data residency objection", channel: "voice", promptVersion: 2, time: "Yesterday, 2:40 PM", status: "completed" },
  { id: "e10", campaignId: "c2", agentKey: "strategy", action: "Skipped Rajesh Iyer: already contacted by another campaign 2 days ago", channel: null, promptVersion: 2, time: "Yesterday, 11:05 AM", status: "completed" },
  { id: "e11", campaignId: "c2", agentKey: "personalisation", action: "Email to Sunita Menon is waiting for review", channel: "email", promptVersion: 2, time: "Yesterday, 10:30 AM", status: "pending_approval" },
  { id: "e12", campaignId: "c2", agentKey: "research", action: "Enrichment failed for Apex Finserv: company page unreachable", channel: null, promptVersion: 1, time: "2 days ago", status: "failed" },

  // c3: Voice AI Founders (prompt v1)
  { id: "e13", campaignId: "c3", agentKey: "voice", action: "Qualified call with Sam Ortiz (Founder, Echo Voice), asked for a demo", channel: "voice", promptVersion: 1, time: "8 min ago", status: "completed" },
  { id: "e14", campaignId: "c3", agentKey: "personalisation", action: "Drafted LinkedIn note to Lena Fischer (CEO, Talkwave)", channel: "linkedin", promptVersion: 1, time: "18 min ago", status: "completed" },
  { id: "e15", campaignId: "c3", agentKey: "conversation", action: "Negative reply from Chris Wu, added to do-not-contact list", channel: "email", promptVersion: 1, time: "34 min ago", status: "completed" },
  { id: "e16", campaignId: "c3", agentKey: "icp_fitment", action: "Qualified Nova Speech (seed stage, 12 employees)", channel: null, promptVersion: 1, time: "52 min ago", status: "completed" },
  { id: "e17", campaignId: "c3", agentKey: "voice", action: "Mia Torres asked to speak to a human, call transferred", channel: "voice", promptVersion: 1, time: "1 hr ago", status: "escalated" },
  { id: "e18", campaignId: "c3", agentKey: "followup", action: "Stopped follow-ups for Ivy Chen after 3 touches with no reply", channel: "email", promptVersion: 1, time: "2 hr ago", status: "completed" },
];