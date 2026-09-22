from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.tables import ActivityEvent, AgentJob, CampaignProspect, CampaignStats, ProspectMessage, utcnow
from app.services.campaign_service import ServiceError, get_or_404


EMPTY_STATS = {
    "outreach": {"linkedin": 0, "email": 0, "sms": 0, "voice": 0},
    "followups": 0,
    "outcomes": {"positive": 0, "negative": 0, "neutral": 0},
    "workflows": {"active": 0, "completed": 0, "failed": 0},
}


def relative(dt) -> str:
    minutes = int((utcnow() - dt).total_seconds() // 60)
    if minutes < 1:
        return "just now"
    if minutes < 60:
        return f"{minutes} min ago"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} hr ago"
    days = hours // 24
    return "Yesterday" if days == 1 else f"{days} days ago"


def event_dict(e: ActivityEvent) -> dict:
    return {
        "id": e.id,
        "campaignId": e.campaign_id,
        "agentKey": e.agent_key,
        "action": e.action,
        "channel": e.channel,
        "promptVersion": e.prompt_version,
        "time": relative(e.created_at),
        "createdAt": e.created_at.isoformat(),
        "status": e.status,
        "kind": e.kind,
        "source": e.source,
        "mode": e.mode,
        "tokensIn": e.tokens_in,
        "tokensOut": e.tokens_out,
        "costUsd": round(e.cost_usd, 6),
    }


def list_events(db: Session, campaign_id: str, limit: int = 100) -> list[dict]:
    get_or_404(db, campaign_id)
    rows = db.scalars(
        select(ActivityEvent)
        .where(ActivityEvent.campaign_id == campaign_id)
        .order_by(ActivityEvent.created_at.desc())
        .limit(max(1, min(limit, 500)))
    ).all()
    return [event_dict(e) for e in rows]


def get_stats(db: Session, campaign_id: str) -> dict:
    """Seeded numbers for a campaign that has not run. Real numbers, counted from the database, once it has."""
    get_or_404(db, campaign_id)
    has_run = db.scalar(select(func.count()).select_from(CampaignProspect).where(CampaignProspect.campaign_id == campaign_id))
    if not has_run:
        row = db.get(CampaignStats, campaign_id)
        return row.data if row else EMPTY_STATS

    outreach = {"linkedin": 0, "email": 0, "sms": 0, "voice": 0}
    followups = 0
    for m in db.scalars(select(ProspectMessage).where(
        ProspectMessage.campaign_id == campaign_id, ProspectMessage.direction == "out",
        ProspectMessage.status.in_(("sent", "sandbox")),
    )).all():
        if m.kind == "followup":
            followups += 1
        if m.kind in ("first_touch", "followup") and m.channel in outreach:
            outreach[m.channel] += 1

    outcomes = {"positive": 0, "negative": 0, "neutral": 0}
    for m in db.scalars(select(ProspectMessage).where(
        ProspectMessage.campaign_id == campaign_id, ProspectMessage.direction == "in", ProspectMessage.status == "processed",
    )).all():
        s = (m.meta or {}).get("sentiment", "neutral")
        outcomes[s if s in outcomes else "neutral"] += 1

    jobs = dict(db.execute(
        select(AgentJob.status, func.count()).where(AgentJob.campaign_id == campaign_id).group_by(AgentJob.status)
    ).all())
    return {
        "outreach": outreach,
        "followups": followups,
        "outcomes": outcomes,
        "workflows": {"active": jobs.get("queued", 0) + jobs.get("running", 0), "completed": jobs.get("done", 0), "failed": jobs.get("dead", 0)},
    }


def decide(db: Session, event_id: str, decision: str) -> dict:
    e = db.get(ActivityEvent, event_id)
    if e is None:
        raise ServiceError("Event not found", 404)
    if e.status != "pending_approval":
        raise ServiceError("This event is not waiting for approval", 409)
    e.status = decision
    from app.services import pipeline  # local import avoids a circular import

    pipeline.on_review_decision(db, e, decision)
    db.commit()
    return event_dict(e)