from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

Channel = Literal["linkedin", "email", "sms", "voice"]


class Lenient(BaseModel):
    model_config = ConfigDict(extra="ignore")

    @field_validator("*", mode="before")
    @classmethod
    def _lists(cls, v, info):
        f = cls.model_fields.get(info.field_name)
        if f is not None and f.annotation == list[str]:
            if v is None:
                return []
            if isinstance(v, str):
                return [v] if v.strip() else []
        return v


def _unit(v):
    if isinstance(v, (int, float)) and 1 < v <= 100:
        return v / 100
    return v


class IcpOut(Lenient):
    qualified: bool
    score: int
    reasons: list[str] = []
    pain_points: list[str] = []
    missing_information: list[str] = []
    requires_human_review: bool = False

    @field_validator("score", mode="before")
    @classmethod
    def _score(cls, v):
        return max(0, min(100, round(v))) if isinstance(v, (int, float)) else v


class ResearchOut(Lenient):
    company_industry: str = ""
    company_summary: str = ""
    professional_context: str = ""
    signals: list[str] = []
    tech_stack_hints: list[str] = []
    sources_used: list[str] = []
    confidence: float = Field(default=0.5, ge=0, le=1)
    missing_information: list[str] = []
    requires_human_review: bool = False

    @field_validator("confidence", mode="before")
    @classmethod
    def _conf(cls, v):
        return _unit(v)


_CHANNEL_ALIASES = {"phone": "voice", "call": "voice", "text": "sms", "linkedin_dm": "linkedin"}


def _channel(v):
    """Models write 'Email', 'Phone' or 'LinkedIn'. Normalise, and let strategy.py drop anything unusable."""
    if isinstance(v, str):
        v = v.strip().lower().replace(" ", "_")
        return _CHANNEL_ALIASES.get(v, v)
    return v


class Step(Lenient):
    step: int = 1
    channel: str
    purpose: str = ""

    @field_validator("channel", mode="before")
    @classmethod
    def _ch(cls, v):
        return _channel(v)


class StrategyOut(Lenient):
    primary_channel: str
    secondary_channel: Optional[str] = None

    @field_validator("primary_channel", "secondary_channel", mode="before")
    @classmethod
    def _ch(cls, v):
        return _channel(v)

    objective: str = ""
    sequence: list[Step] = []
    reasoning: str = ""
    requires_human_review: bool = False


class MessageOut(Lenient):
    subject: str = ""
    body: str
    personalization_points: list[str] = []
    cta: str = ""
    confidence: float = Field(default=0.5, ge=0, le=1)
    knowledge_sources_used: list[str] = []
    requires_human_review: bool = False

    @field_validator("confidence", mode="before")
    @classmethod
    def _conf(cls, v):
        return _unit(v)