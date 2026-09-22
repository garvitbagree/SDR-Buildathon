"""Turns whatever the request or the LLM's intent-extraction gave us (an id, a name, or nothing -
just the remembered context from earlier in the conversation) into an actual Campaign/
CampaignProspect row, or a clear "couldn't find it" / "which one did you mean" signal.
"""
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.tables import Campaign, CampaignProspect


@dataclass
class Resolved:
    obj: object | None = None
    ambiguous: list[str] | None = None  # names of multiple matches, if any
    not_found_query: str | None = None  # what was searched for, if nothing matched


def resolve_campaign(db: Session, campaign_id: str | None, campaign_name: str | None) -> Resolved:
    if campaign_id:
        c = db.get(Campaign, campaign_id)
        return Resolved(obj=c) if c else Resolved(not_found_query=campaign_id)
    if not campaign_name or not campaign_name.strip():
        return Resolved()
    q = campaign_name.strip().lower()
    rows = db.scalars(select(Campaign)).all()
    hits = [c for c in rows if q in c.name.lower()]
    if len(hits) == 1:
        return Resolved(obj=hits[0])
    if len(hits) > 1:
        return Resolved(ambiguous=[c.name for c in hits])
    return Resolved(not_found_query=campaign_name)


def resolve_prospect(db: Session, prospect_id: str | None, prospect_name: str | None, campaign_id: str | None) -> Resolved:
    if prospect_id:
        p = db.get(CampaignProspect, prospect_id)
        return Resolved(obj=p) if p else Resolved(not_found_query=prospect_id)
    if not prospect_name or not prospect_name.strip():
        return Resolved()
    q = prospect_name.strip().lower()
    stmt = select(CampaignProspect)
    if campaign_id:
        stmt = stmt.where(CampaignProspect.campaign_id == campaign_id)
    rows = db.scalars(stmt).all()
    hits = [p for p in rows if q in p.name.lower()]
    if len(hits) == 1:
        return Resolved(obj=hits[0])
    if len(hits) > 1:
        return Resolved(ambiguous=[f"{p.name} ({p.company})" for p in hits])
    return Resolved(not_found_query=prospect_name)