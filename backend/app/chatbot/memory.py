"""Lightweight, in-process conversation memory for the SDR Copilot.

Deliberately not database-backed: the existing schema has nothing for chat history, adding a
table for it is a real migration for a feature that doesn't need to survive a restart (per the
project's "don't add tables unless genuinely required" convention, matched here). Conversation
state - recent turns, and any action awaiting a yes/no confirmation - lives in a plain dict keyed
by conversation_id. Lost on redeploy, which is an acceptable tradeoff for a demo assistant.
"""
import threading
import uuid

MAX_TURNS = 12  # kept short on purpose - see orchestrator.py for why the full history isn't ever resent

_lock = threading.Lock()
_conversations: dict[str, dict] = {}


def get_or_create(conversation_id: str | None) -> tuple[str, dict]:
    with _lock:
        if conversation_id and conversation_id in _conversations:
            return conversation_id, _conversations[conversation_id]
        cid = conversation_id or uuid.uuid4().hex
        convo = {"history": [], "pending_action": None, "campaign_id": None, "prospect_id": None}
        _conversations[cid] = convo
        return cid, convo


def add_turn(convo: dict, role: str, content: str) -> None:
    convo["history"].append({"role": role, "content": content})
    if len(convo["history"]) > MAX_TURNS:
        convo["history"] = convo["history"][-MAX_TURNS:]


def set_pending(convo: dict, action: dict | None) -> None:
    convo["pending_action"] = action