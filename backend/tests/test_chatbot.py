"""Tests the SDR Copilot end-to-end through the real FastAPI app, with only the Groq HTTP call
mocked - so this exercises the real router, orchestrator, entity resolution, and the real
services underneath (campaign_service.set_status, activity_service.decide, etc.), not a
reimplementation of them.

Every campaign/prospect name below is unique to its own test. This matters here specifically
because the chatbot resolves entities by NAME (fuzzy match), and this whole test suite shares one
SQLite file across test files within a single pytest run (app.db's engine is bound once, at
whichever file Python imports first) - other test files never noticed because they only ever
look things up by unique id. Reusing a name across two tests here would make the fuzzy matcher
correctly report "which one did you mean?" instead of acting - correct chatbot behavior, wrong
for test isolation, so unique names sidestep it rather than fighting it."""
import json
import os
import sys
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.gettempdir(), f"sdr_test_chat_{os.getpid()}.db")
os.environ.setdefault("AUTO_GMAIL_POLL", "0")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
from fastapi.testclient import TestClient

from app import llm
from app.db import SessionLocal
from app.models.tables import ActivityEvent, Campaign, CampaignProspect

EMPTY_FUNNEL = {"discovered": 0, "researched": 0, "qualified": 0, "contacted": 0, "engaged": 0, "meeting": 0, "opportunity": 0}


def _groq_reply(content: dict) -> httpx.Response:
    return httpx.Response(200, json={
        "choices": [{"message": {"content": json.dumps(content)}}],
        "usage": {"prompt_tokens": 20, "completion_tokens": 10},
    })


def _campaign(db, cid, name, status="live"):
    c = Campaign(
        id=cid, name=name, owner="Aarav Mehta", status=status, icp="SaaS", geography="United States",
        target_roles=["CTO"], approval_mode="none", created_at="2026-09-22", updated_at="2026-09-22",
        agents=[], channels=[], funnel=dict(EMPTY_FUNNEL),
    )
    db.add(c)
    return c


def _prospect(db, pid, cid, name, state="ICP_REJECTED", icp=None):
    p = CampaignProspect(id=pid, campaign_id=cid, name=name, title="CTO", company="Acme", state=state, icp=icp or {})
    db.add(p)
    return p


def test_read_intent_answers_campaign_stats():
    saved_env, saved_post = dict(os.environ), llm.httpx.post
    os.environ["GROQ_API_KEYS"], os.environ["GROQ_KEY_RPM"] = "k1", "6000"
    llm._pool = None

    def fake_post(url, json=None, headers=None, timeout=None):
        return _groq_reply({"intent": "READ", "tool": "get_campaign_stats", "prospect_name": "",
                             "campaign_name": "Copilot Stats Campaign", "query": "", "needs_clarification": False, "clarification": ""})
    llm.httpx.post = fake_post

    try:
        from app.main import app
        with TestClient(app) as client:
            with SessionLocal() as db:
                _campaign(db, "chat_c1", "Copilot Stats Campaign")
                db.commit()
            r = client.post("/chat", json={"message": "How many qualified prospects in Copilot Stats Campaign?"})
            assert r.status_code == 200
            body = r.json()
            assert body["intent"] == "READ"
            assert "get_campaign_stats" in body["toolCalls"]
            assert "Copilot Stats Campaign" in body["message"]
            assert body["requiresConfirmation"] is False
    finally:
        llm.httpx.post = saved_post
        llm._pool = None
        os.environ.clear()
        os.environ.update(saved_env)


def test_read_intent_explains_rejected_prospect_without_a_model_call_for_the_explanation():
    """explain_prospect() is pure formatting, not a model call - this confirms the reply text
    actually reflects the real reasons stored on the prospect, not something invented."""
    saved_env, saved_post = dict(os.environ), llm.httpx.post
    os.environ["GROQ_API_KEYS"], os.environ["GROQ_KEY_RPM"] = "k1", "6000"
    llm._pool = None

    def fake_post(url, json=None, headers=None, timeout=None):
        return _groq_reply({"intent": "READ", "tool": "explain_prospect", "prospect_name": "Priya Iyer-Copilot",
                             "campaign_name": "", "query": "", "needs_clarification": False, "clarification": ""})
    llm.httpx.post = fake_post

    try:
        from app.main import app
        with TestClient(app) as client:
            with SessionLocal() as db:
                c = _campaign(db, "chat_c2", "Copilot Explain Campaign")
                _prospect(db, "chat_p1", c.id, "Priya Iyer-Copilot", icp={"reasons": ["Wrong geography"], "score": 30})
                db.commit()
            r = client.post("/chat", json={"message": "Why was Priya rejected?"})
            body = r.json()
            assert r.status_code == 200
            assert "Wrong geography" in body["message"]
            assert body["dataType"] == "prospect"
    finally:
        llm.httpx.post = saved_post
        llm._pool = None
        os.environ.clear()
        os.environ.update(saved_env)


def test_action_requires_confirmation_then_actually_pauses_via_real_campaign_service():
    saved_env, saved_post = dict(os.environ), llm.httpx.post
    os.environ["GROQ_API_KEYS"], os.environ["GROQ_KEY_RPM"] = "k1", "6000"
    llm._pool = None

    def fake_post(url, json=None, headers=None, timeout=None):
        return _groq_reply({"intent": "ACTION", "tool": "pause_campaign", "prospect_name": "",
                             "campaign_name": "Copilot Pause Campaign", "query": "", "needs_clarification": False, "clarification": ""})
    llm.httpx.post = fake_post

    try:
        from app.main import app
        with TestClient(app) as client:
            with SessionLocal() as db:
                c = _campaign(db, "chat_c3", "Copilot Pause Campaign")
                db.commit()
            r1 = client.post("/chat", json={"message": "Pause the Copilot Pause Campaign campaign"})
            body1 = r1.json()
            assert body1["requiresConfirmation"] is True, body1
            with SessionLocal() as db:
                assert db.get(Campaign, "chat_c3").status == "live"  # not paused yet - confirmation pending

            r2 = client.post("/chat", json={"message": "yes", "conversationId": body1["conversationId"]})
            body2 = r2.json()
            assert body2["requiresConfirmation"] is False
            with SessionLocal() as db:
                assert db.get(Campaign, "chat_c3").status == "paused"  # the REAL safety-layer function ran
    finally:
        llm.httpx.post = saved_post
        llm._pool = None
        os.environ.clear()
        os.environ.update(saved_env)


def test_action_cancelled_does_not_change_anything():
    saved_env, saved_post = dict(os.environ), llm.httpx.post
    os.environ["GROQ_API_KEYS"], os.environ["GROQ_KEY_RPM"] = "k1", "6000"
    llm._pool = None

    def fake_post(url, json=None, headers=None, timeout=None):
        return _groq_reply({"intent": "ACTION", "tool": "pause_campaign", "prospect_name": "",
                             "campaign_name": "Copilot Cancel Campaign", "query": "", "needs_clarification": False, "clarification": ""})
    llm.httpx.post = fake_post

    try:
        from app.main import app
        with TestClient(app) as client:
            with SessionLocal() as db:
                c = _campaign(db, "chat_c4", "Copilot Cancel Campaign")
                db.commit()
            r1 = client.post("/chat", json={"message": "Pause the Copilot Cancel Campaign campaign"})
            body1 = r1.json()
            assert body1["requiresConfirmation"] is True, body1
            cid = body1["conversationId"]
            client.post("/chat", json={"message": "no", "conversationId": cid})
            with SessionLocal() as db:
                assert db.get(Campaign, "chat_c4").status == "live"
    finally:
        llm.httpx.post = saved_post
        llm._pool = None
        os.environ.clear()
        os.environ.update(saved_env)


def test_approve_prospect_uses_real_activity_service_decide():
    saved_env, saved_post = dict(os.environ), llm.httpx.post
    os.environ["GROQ_API_KEYS"], os.environ["GROQ_KEY_RPM"] = "k1", "6000"
    llm._pool = None

    def fake_post(url, json=None, headers=None, timeout=None):
        return _groq_reply({"intent": "ACTION", "tool": "approve_prospect", "prospect_name": "Zara Khan-Copilot",
                             "campaign_name": "", "query": "", "needs_clarification": False, "clarification": ""})
    llm.httpx.post = fake_post

    try:
        from app.main import app
        with TestClient(app) as client:
            with SessionLocal() as db:
                c = _campaign(db, "chat_c5", "Copilot Approve Campaign")
                p = _prospect(db, "chat_p5", c.id, "Zara Khan-Copilot", state="READY_FOR_REVIEW")
                db.add(ActivityEvent(id="ev_copilot1", campaign_id=c.id, prospect_id=p.id, agent_key="personalisation",
                                      action="Drafted", status="pending_approval"))
                db.commit()
            r1 = client.post("/chat", json={"message": "Approve Zara"})
            body1 = r1.json()
            assert body1["requiresConfirmation"] is True, body1
            r2 = client.post("/chat", json={"message": "yes", "conversationId": body1["conversationId"]})
            assert r2.status_code == 200
            with SessionLocal() as db:
                ev = db.get(ActivityEvent, "ev_copilot1")
                assert ev.status == "approved"
                p = db.get(CampaignProspect, "chat_p5")
                assert p.state == "READY_TO_SEND"  # on_review_decision() actually ran
    finally:
        llm.httpx.post = saved_post
        llm._pool = None
        os.environ.clear()
        os.environ.update(saved_env)


def test_unknown_or_unclear_message_asks_for_clarification_without_calling_any_tool():
    saved_env, saved_post = dict(os.environ), llm.httpx.post
    os.environ["GROQ_API_KEYS"], os.environ["GROQ_KEY_RPM"] = "k1", "6000"
    llm._pool = None

    def fake_post(url, json=None, headers=None, timeout=None):
        return _groq_reply({"intent": "ACTION", "tool": "pause_campaign", "prospect_name": "", "campaign_name": "",
                             "query": "", "needs_clarification": True, "clarification": "Which campaign do you mean?"})
    llm.httpx.post = fake_post

    try:
        from app.main import app
        with TestClient(app) as client:
            r = client.post("/chat", json={"message": "Pause it"})
            body = r.json()
            assert r.status_code == 200
            assert body["toolCalls"] == []
            assert "which campaign" in body["message"].lower()
    finally:
        llm.httpx.post = saved_post
        llm._pool = None
        os.environ.clear()
        os.environ.update(saved_env)


if __name__ == "__main__":
    test_read_intent_answers_campaign_stats()
    test_read_intent_explains_rejected_prospect_without_a_model_call_for_the_explanation()
    test_action_requires_confirmation_then_actually_pauses_via_real_campaign_service()
    test_action_cancelled_does_not_change_anything()
    test_approve_prospect_uses_real_activity_service_decide()
    test_unknown_or_unclear_message_asks_for_clarification_without_calling_any_tool()
    print("chatbot tests OK")