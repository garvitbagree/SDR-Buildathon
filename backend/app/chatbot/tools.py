"""Every tool here is a thin wrapper over an existing service function. None of them touch the
database directly beyond what the wrapped service already did, none of them run arbitrary code,
and the two agent-rerun tools deliberately skip move() (see rerun_icp/rerun_research below) so a
re-run can never trigger the same "invalid transition" crash the worker's own handlers are
exposed to when called out of sequence.
"""
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents import followup, icp, research
from app.llm import generate_json, model_for
from app.models.tables import ActivityEvent, Campaign, CampaignProspect, ProspectMessage
from app.rag import retrieve
from app.services import activity_service, campaign_service, pipeline
from app.services.campaign_service import ServiceError, _id
from app.chatbot.prompts import KnowledgeAnswerOut

AGENT = "sdr_copilot"


# ---------- read tools ----------
def get_campaign_stats(db: Session, c: Campaign) -> dict:
    return pipeline.summary(db, c)


def search_prospects(db: Session, campaign_id: str | None, state: str | None = None, limit: int = 20) -> list[dict]:
    stmt = select(CampaignProspect)
    if campaign_id:
        stmt = stmt.where(CampaignProspect.campaign_id == campaign_id)
    if state:
        stmt = stmt.where(CampaignProspect.state == state.upper())
    rows = db.scalars(stmt.order_by(CampaignProspect.updated_at.desc()).limit(max(1, min(limit, 100)))).all()
    return [p.to_dict() for p in rows]


def get_prospect(db: Session, p: CampaignProspect) -> dict:
    return p.to_dict(full=True)


def explain_prospect(p: CampaignProspect) -> str:
    """Formats an explanation purely from what's already on the record - no model call, so it
    can never invent a reason that doesn't actually appear in the prospect's own data."""
    icp_r = p.icp or {}
    research_r = p.research or {}
    message_r = p.message or {}
    if p.state == "ICP_REJECTED":
        reasons = "; ".join(icp_r.get("reasons", [])) or "no reasons were recorded"
        return f"{p.name} was rejected at ICP fitment (score {icp_r.get('score', '?')}): {reasons}"
    if p.state == "HUMAN_REVIEW":
        if research_r.get("requires_human_review"):
            missing = ", ".join(research_r.get("missing_information", [])) or "unspecified details"
            return (f"{p.name} is waiting for human review after research - confidence "
                     f"{research_r.get('confidence', '?')}, missing: {missing}")
        reasons = "; ".join(icp_r.get("reasons", [])) or "the agent asked for review"
        return f"{p.name} is waiting for human review: {reasons}"
    if p.state in ("READY_FOR_REVIEW",):
        reasons = ", ".join(message_r.get("review_reasons", [])) or "no specific reason was logged"
        return f"{p.name}'s drafted message is waiting for approval: {reasons}"
    if p.error:
        return f"{p.name} failed: {p.error}"
    return f"{p.name} is currently {p.state.replace('_', ' ').lower()}."


def get_pending_reviews(db: Session, campaign_id: str | None = None, limit: int = 20) -> list[dict]:
    stmt = select(ActivityEvent).where(ActivityEvent.status.in_(("pending_approval", "escalated")))
    if campaign_id:
        stmt = stmt.where(ActivityEvent.campaign_id == campaign_id)
    rows = db.scalars(stmt.order_by(ActivityEvent.created_at.desc()).limit(max(1, min(limit, 100)))).all()
    out = []
    for ev in rows:
        p = db.get(CampaignProspect, ev.prospect_id) if ev.prospect_id else None
        out.append({
            "eventId": ev.id, "prospectId": ev.prospect_id, "prospectName": p.name if p else None,
            "action": ev.action, "status": ev.status, "agentKey": ev.agent_key,
        })
    return out


# ---------- AI-operation tools (mutate agent output, never send anything) ----------
def rerun_icp(db: Session, c: Campaign, p: CampaignProspect) -> dict:
    out, meta = icp.run(db, c, p)
    ok = out.qualified and out.score >= c.qualify_threshold
    p.score = out.score
    p.icp = {**out.model_dump(), "final_qualified": ok, "threshold": c.qualify_threshold}
    pipeline.log_event(db, c, p, "icp_fitment",
                        f"Re-run via SDR Copilot: {'qualified' if ok else 'rejected'}, score {out.score}",
                        "completed", meta)
    db.commit()
    return {"qualified": ok, "score": out.score, "reasons": out.reasons}


def rerun_research(db: Session, c: Campaign, p: CampaignProspect) -> dict:
    result, meta = research.run(db, c, p)
    p.research = result
    pipeline.log_event(db, c, p, "research", "Re-run via SDR Copilot", "completed", meta)
    db.commit()
    return {"companySummary": result.get("company_summary", ""), "confidence": result.get("confidence")}


def generate_followup(db: Session, c: Campaign, p: CampaignProspect) -> dict:
    """Always drafts for approval, even if the normal rules would have auto-sent it - the
    Copilot never sends outreach directly, that decision stays with the existing approve/reject
    pathway (and, for a real-inbox prospect, the same scoped real-send logic as everywhere else)."""
    d = followup.decide(db, c, p)
    if d["action"] != "send":
        return {"drafted": False, "reason": d["reason"]}
    result, meta = followup.draft(db, c, p, d["touch"], d["channel"], d["last"])
    row = ProspectMessage(
        id=_id("pm"), campaign_id=c.id, prospect_id=p.id, direction="out", channel=d["channel"],
        kind="followup", subject=result["subject"], body=result["body"], status="draft",
        meta={"flags": result["flags"]},
    )
    db.add(row)
    pipeline.log_event(db, c, p, "followup", f"Follow-up drafted via SDR Copilot for {p.name}, waiting for approval",
                        "pending_approval", meta, channel=d["channel"])
    db.commit()
    return {"drafted": True, "subject": result["subject"], "body": result["body"]}


# ---------- action tools (side effects - orchestrator only calls these after confirmation) ----------
def pause_campaign(db: Session, campaign_id: str) -> dict:
    return campaign_service.set_status(db, campaign_id, "paused").to_dict()


def resume_campaign(db: Session, campaign_id: str) -> dict:
    return campaign_service.set_status(db, campaign_id, "live").to_dict()


def approve_prospect(db: Session, prospect_id: str) -> dict:
    ev = activity_service.get_latest_pending_event_for_prospect(db, prospect_id)
    if ev is None:
        raise ServiceError("This prospect has nothing waiting for approval right now", 409)
    return activity_service.decide(db, ev.id, "approved")


def reject_prospect(db: Session, prospect_id: str) -> dict:
    ev = activity_service.get_latest_pending_event_for_prospect(db, prospect_id)
    if ev is None:
        raise ServiceError("This prospect has nothing waiting for approval right now", 409)
    return activity_service.decide(db, ev.id, "rejected")


# ---------- knowledge tool (RAG) ----------
def knowledge_lookup(db: Session, campaign_id: str | None, query: str) -> dict:
    docs = retrieve(db, campaign_id or "", query, k=3) if campaign_id else []
    if not docs:
        return {"answer": "I couldn't find anything in this campaign's knowledge base for that.", "sources": []}
    model, tier = model_for(db, "SDR Copilot knowledge answer")
    user = (
        "Answer the manager's question using ONLY the knowledge below. If the knowledge doesn't "
        "actually answer it, say so instead of guessing.\n"
        f"Question: {query}\n\nKnowledge:\n" + json.dumps([{"title": d["title"], "content": d["content"]} for d in docs])
        + '\n\nReturn JSON: {"answer": str, "sources": [str]} where sources are the titles you actually used.'
    )
    out, _meta = generate_json(model, tier, "You answer only from the knowledge given, never invent claims.",
                                user, KnowledgeAnswerOut, temperature=0.2)
    return out.model_dump()