"""Tests the simulate-reply demo helper: it should behave exactly like a real inbound reply
(same guards, same state advance, same enqueue), just with the text supplied by us instead of
a webhook, so it's safe to trigger live during a demo."""
import os
import sys
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.gettempdir(), f"sdr_test_sim_{os.getpid()}.db")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from app.db import Base, SessionLocal, engine
from app.models.tables import AgentJob, Campaign, CampaignProspect, ProspectMessage
from app.services import replies
from app.services.campaign_service import ServiceError


def _campaign(db, cid="c1"):
    c = Campaign(
        id=cid, name="Test Campaign", owner="Aarav Mehta", status="live", icp="SaaS", geography="United States",
        target_roles=["CTO"], approval_mode="none", created_at="2026-09-20", updated_at="2026-09-20",
        agents=[{"key": "conversation", "name": "conversation", "enabled": True, "paused": False}],
        channels=[{"channel": "email", "enabled": True, "paused": False, "dailyLimit": 100}],
    )
    db.add(c)
    return c


def _prospect(db, c, pid="p1", state="WAITING_FOR_RESPONSE", sent=True):
    p = CampaignProspect(id=pid, campaign_id=c.id, name="Jane Doe", title="CTO", company="Acme",
                          location="United States", email="jane@acme.com", state=state)
    db.add(p)
    if sent:
        db.add(ProspectMessage(id=f"pm_{pid}", campaign_id=c.id, prospect_id=p.id, direction="out",
                                channel="email", kind="first_touch", body="Hi Jane", status="sent"))
    return p


def _setup():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)


def test_simulate_reply_random_prospect_and_intent():
    _setup()
    with SessionLocal() as db:
        c = _campaign(db)
        _prospect(db, c)
        db.commit()

        c = db.get(Campaign, "c1")
        result = replies.simulate_reply(db, c)

        assert result["prospectId"] == "p1"
        assert result["simulatedIntent"] in replies.SIMULATED_REPLIES
        assert result["channel"] == "email"
        assert result["accepted"] is True

        p = db.get(CampaignProspect, "p1")
        assert p.state != "WAITING_FOR_RESPONSE"  # try_advance moved it on RESPONSE_RECEIVED
        inbound = db.scalars(select(ProspectMessage).where(
            ProspectMessage.prospect_id == "p1", ProspectMessage.direction == "in"
        )).all()
        assert len(inbound) == 1 and inbound[0].body == result["text"]
        job = db.scalar(select(AgentJob).where(AgentJob.prospect_id == "p1", AgentJob.agent == "conversation"))
        assert job is not None and job.status == "queued"


def test_simulate_reply_explicit_prospect_and_intent():
    _setup()
    with SessionLocal() as db:
        c = _campaign(db)
        _prospect(db, c, pid="p1")
        _prospect(db, c, pid="p2")  # a second, unrelated prospect, to prove targeting works
        db.commit()

        c = db.get(Campaign, "c1")
        result = replies.simulate_reply(db, c, prospect_id="p2", intent="not_interested")

        assert result["prospectId"] == "p2"
        assert result["simulatedIntent"] == "not_interested"
        assert result["text"] in replies.SIMULATED_REPLIES["not_interested"]
        # the other prospect must be untouched
        assert db.get(CampaignProspect, "p1").state == "WAITING_FOR_RESPONSE"


def test_simulate_reply_unknown_intent_rejected():
    _setup()
    with SessionLocal() as db:
        c = _campaign(db)
        _prospect(db, c)
        db.commit()
        c = db.get(Campaign, "c1")
        try:
            replies.simulate_reply(db, c, intent="curious")
            assert False, "should have raised"
        except ServiceError as e:
            assert e.status == 422


def test_simulate_reply_no_eligible_prospect():
    _setup()
    with SessionLocal() as db:
        c = _campaign(db)
        _prospect(db, c, state="DISCOVERED", sent=False)  # not waiting for a response
        db.commit()
        c = db.get(Campaign, "c1")
        try:
            replies.simulate_reply(db, c)
            assert False, "should have raised"
        except ServiceError as e:
            assert e.status == 409


def test_simulate_reply_prospect_from_other_campaign_rejected():
    _setup()
    with SessionLocal() as db:
        c1 = _campaign(db, cid="c1")
        c2 = _campaign(db, cid="c2")
        _prospect(db, c1, pid="p1")
        db.commit()
        c2 = db.get(Campaign, "c2")
        try:
            replies.simulate_reply(db, c2, prospect_id="p1")
            assert False, "should have raised"
        except ServiceError as e:
            assert e.status == 404


if __name__ == "__main__":
    test_simulate_reply_random_prospect_and_intent()
    test_simulate_reply_explicit_prospect_and_intent()
    test_simulate_reply_unknown_intent_rejected()
    test_simulate_reply_no_eligible_prospect()
    test_simulate_reply_prospect_from_other_campaign_rejected()
    print("simulate_reply tests OK")