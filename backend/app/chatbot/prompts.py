from typing import Literal

from app.agents.schemas import Lenient

SYSTEM_PROMPT = (
    "You are the SDR Copilot for Reachwell, an autonomous SDR platform. You help a sales manager "
    "understand and operate the existing system. You use only the tool results you are given - "
    "never invent a prospect, a number, or a reason that isn't in the data. If a tool found "
    "nothing, say so plainly instead of guessing."
)

INTENT_GUIDE = (
    "Classify the manager's message into exactly one intent:\n"
    "- READ: a question answerable from existing data (counts, lists, a single prospect's status "
    "or the reasons behind it, a campaign summary).\n"
    "- AI_OPERATION: asks an agent to actually do something (re-run ICP scoring, re-run research, "
    "draft a follow-up).\n"
    "- ACTION: a control-plane change (pause/resume a campaign, approve/reject a prospect).\n"
    "- KNOWLEDGE: a question about messaging, positioning or objection handling that needs the "
    "campaign's knowledge base, not live prospect data.\n"
    "- UNKNOWN: anything else, or too vague to act on.\n\n"
    "tool is one of: get_campaign_stats, search_prospects, get_prospect, explain_prospect, "
    "get_pending_reviews, rerun_icp, rerun_research, generate_followup, pause_campaign, "
    "resume_campaign, approve_prospect, reject_prospect, knowledge_lookup, or empty if none fit.\n"
    "prospect_name and campaign_name are whatever the message names, in plain text, exactly as "
    "written - leave empty if the message doesn't name one and instead relies on context already "
    "established earlier in the conversation.\n"
    "Set needs_clarification true only when the request cannot be acted on at all without more "
    "information (for example \"pause it\" with no campaign named anywhere in this conversation)."
)


class IntentOut(Lenient):
    intent: Literal["READ", "AI_OPERATION", "ACTION", "KNOWLEDGE", "UNKNOWN"]
    tool: str = ""
    prospect_name: str = ""
    campaign_name: str = ""
    query: str = ""
    needs_clarification: bool = False
    clarification: str = ""


class KnowledgeAnswerOut(Lenient):
    answer: str
    sources: list[str] = []