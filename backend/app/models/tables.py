from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(Text, default="")
    owner: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="draft")
    icp: Mapped[str] = mapped_column(String)
    geography: Mapped[str] = mapped_column(String, default="")
    target_roles: Mapped[list] = mapped_column(JSON, default=list)
    company_criteria: Mapped[str] = mapped_column(Text, default="")
    exclusions: Mapped[str] = mapped_column(Text, default="")
    reference_profiles: Mapped[str] = mapped_column(Text, default="")
    approval_mode: Mapped[str] = mapped_column(String, default="first_touch")
    qualify_threshold: Mapped[int] = mapped_column(Integer, default=70)
    confidence_threshold: Mapped[int] = mapped_column(Integer, default=60)
    escalate_on: Mapped[list] = mapped_column(JSON, default=list)
    agents: Mapped[list] = mapped_column(JSON, default=list)
    channels: Mapped[list] = mapped_column(JSON, default=list)
    rep_ids: Mapped[list] = mapped_column(JSON, default=list)
    funnel: Mapped[dict] = mapped_column(JSON, default=dict)
    outreach_count: Mapped[int] = mapped_column(Integer, default=0)
    meetings: Mapped[int] = mapped_column(Integer, default=0)
    active_prompt_version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[str] = mapped_column(String)
    updated_at: Mapped[str] = mapped_column(String)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "owner": self.owner,
            "status": self.status,
            "icp": self.icp,
            "geography": self.geography,
            "targetRoles": self.target_roles,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "activePromptVersion": self.active_prompt_version,
            "agents": self.agents,
            "channels": self.channels,
            "funnel": self.funnel,
            "outreachCount": self.outreach_count,
            "meetings": self.meetings,
            "repIds": self.rep_ids,
            "companyCriteria": self.company_criteria,
            "exclusions": self.exclusions,
            "referenceProfiles": self.reference_profiles,
            "approvalMode": self.approval_mode,
            "qualifyThreshold": self.qualify_threshold,
            "confidenceThreshold": self.confidence_threshold,
            "escalateOn": self.escalate_on,
        }


class PromptVersion(Base):
    __tablename__ = "prompt_versions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    campaign_id: Mapped[str] = mapped_column(String, index=True)
    agent_key: Mapped[str] = mapped_column(String)
    version: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    author: Mapped[str] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str] = mapped_column(String, default="")


class ActivityEvent(Base):
    __tablename__ = "activity_events"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    campaign_id: Mapped[str] = mapped_column(String, index=True)
    agent_key: Mapped[str] = mapped_column(String)
    action: Mapped[str] = mapped_column(Text)
    channel: Mapped[str | None] = mapped_column(String, nullable=True)
    kind: Mapped[str] = mapped_column(String, default="decision")  # decision | send
    status: Mapped[str] = mapped_column(String, default="completed")
    prompt_version: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String, default="local")  # local | dronahq
    mode: Mapped[str] = mapped_column(String, default="sandbox")  # live | sandbox
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class Suppression(Base):
    __tablename__ = "suppressions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str] = mapped_column(String, unique=True)
    type: Mapped[str] = mapped_column(String)  # email | domain
    reason: Mapped[str] = mapped_column(String, default="")
    added_by: Mapped[str] = mapped_column(String, default="")
    added_at: Mapped[str] = mapped_column(String, default="")


class GlobalState(Base):
    __tablename__ = "global_state"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, default=dict)

class AuditEntry(Base):
    __tablename__ = "audit_entries"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    campaign_id: Mapped[str] = mapped_column(String, index=True)
    scope: Mapped[str] = mapped_column(String)
    action: Mapped[str] = mapped_column(String)  # created | activated | rolled_back
    version: Mapped[int] = mapped_column(Integer)
    author: Mapped[str] = mapped_column(String)
    time: Mapped[str] = mapped_column(String)
    note: Mapped[str] = mapped_column(String, default="")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "campaignId": self.campaign_id,
            "scope": self.scope,
            "action": self.action,
            "version": self.version,
            "author": self.author,
            "time": self.time,
            "note": self.note,
        }


class Rep(Base):
    __tablename__ = "reps"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    email: Mapped[str] = mapped_column(String, unique=True)
    status: Mapped[str] = mapped_column(String, default="active")
    daily_limit: Mapped[int] = mapped_column(Integer, default=50)
    working_hours: Mapped[str] = mapped_column(String, default="9:00 to 18:00 EST")
    channels: Mapped[list] = mapped_column(JSON, default=list)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "status": self.status,
            "dailyLimit": self.daily_limit,
            "workingHours": self.working_hours,
            "channels": self.channels,
        }


class CampaignStats(Base):
    __tablename__ = "campaign_stats"

    campaign_id: Mapped[str] = mapped_column(String, primary_key=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)

class Prospect(Base):
    __tablename__ = "prospects"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    title: Mapped[str] = mapped_column(String, default="")
    company: Mapped[str] = mapped_column(String, default="")
    email: Mapped[str] = mapped_column(String, default="")
    campaign_ids: Mapped[list] = mapped_column(JSON, default=list)
    touches: Mapped[list] = mapped_column(JSON, default=list)


class ConflictResolution(Base):
    __tablename__ = "conflict_resolutions"

    prospect_id: Mapped[str] = mapped_column(String, primary_key=True)
    action: Mapped[str] = mapped_column(String)  # owner | cooldown | dnc | allow
    owner_id: Mapped[str | None] = mapped_column(String, nullable=True)
    days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str] = mapped_column(String, default="")
    by: Mapped[str] = mapped_column(String)
    time: Mapped[str] = mapped_column(String)
    prev_campaign_ids: Mapped[list] = mapped_column(JSON, default=list)
    added_suppression_id: Mapped[str | None] = mapped_column(String, nullable=True)