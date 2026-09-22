from typing import Any

from pydantic import Field

from app.schemas.campaign import CamelModel


class ChatIn(CamelModel):
    message: str = Field(min_length=1, max_length=2000)
    conversation_id: str | None = None
    campaign_id: str | None = None
    prospect_id: str | None = None


class ChatOut(CamelModel):
    message: str
    conversation_id: str
    intent: str
    sources: list[str] = []
    tool_calls: list[str] = []
    requires_confirmation: bool = False
    action: dict[str, Any] | None = None
    data_type: str | None = None
    data: Any = None