"""Tests pipeline.adjust_target(): raising/lowering the qualified-prospect target on a campaign
that's already been started. No LLM calls involved, so nothing needs mocking here - discovery
itself (DemoSource) is a deterministic offline generator, safe to call for real."""
import os
import sys
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.gettempdir(), f"sdr_test_target_{os.getpid()}.db")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from app.db import Base, SessionLocal, engine
from app.models.tables import Campaign, CampaignProspect
from app.services import pipeline
from app.services.campaign_service import ServiceError

CFG = {
    "targetCount": 5, "objective": "Book a call", "cta": "Open to a call?", "tone": "friendly",
    "industries": ["SaaS"], "painPoints": [], "companySizeMin": 50, "companySizeMax": 1000,
}


def _campaign(db, cid="c1", status="live", target=5):
    c = Campaign(
        id=cid, name="Test Campaign", owner="Aarav Mehta", status=status, icp="SaaS", geography="United States",
        target_roles=["CTO"], approval_mode="none", created_at="2026-09-20", updated_at="2026-09-20",
        agents=[{"key": "icp_fitment", "name": "icp_fitment", "enabled": True, "paused": False}],
        channels=[{"channel": "email", "enabled": True, "paused": False, "dailyLimit": 100}],
        pipeline_config={**CFG, "targetCount": target},
    )
    db.add(c)
    return c


def _qualified_prospect(db, c, pid, qualified=True):
    p = CampaignProspect(
        id=pid, campaign_id=c.id, name=f"Prospect {pid}", title="CTO", company="Acme",
        location="United States", state="STRATEGY_PENDING" if qualified else "ICP_REJECTED",
        icp={"final_qualified": qualified},
    )
    db.add(p)
    return p


def _setup():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)


def test_adjust_target_rejects_non_live_campaign():
    _setup()
    with SessionLocal() as db:
        c = _campaign(db, status="draft")
        db.commit()
        c = db.get(Campaign, "c1")
        try:
            pipeline.adjust_target(db, c, 10)
            assert False, "should have raised"
        except ServiceError as e:
            assert e.status == 409


def test_adjust_target_rejects_campaign_with_no_run():
    _setup()
    with SessionLocal() as db:
        c = _campaign(db, status="live")  # live, but no prospects yet - start() was never called
        db.commit()
        c = db.get(Campaign, "c1")
        try:
            pipeline.adjust_target(db, c, 10)
            assert False, "should have raised"
        except ServiceError as e:
            assert e.status == 409


def test_adjust_target_lowers_without_touching_prospects():
    _setup()
    with SessionLocal() as db:
        c = _campaign(db, target=10)
        for i in range(3):
            _qualified_prospect(db, c, f"p{i}", qualified=True)
        db.commit()

        c = db.get(Campaign, "c1")
        result = pipeline.adjust_target(db, c, 2)

        assert result["previousTarget"] == 10
        assert result["targetCount"] == 2
        assert result["qualified"] == 3  # already-qualified prospects are untouched by lowering
        assert db.get(Campaign, "c1").pipeline_config["targetCount"] == 2
        prospect_count_after = len(db.scalars(select(CampaignProspect)).all())
        assert prospect_count_after == 3  # nothing was added or removed


def test_adjust_target_raise_triggers_more_discovery():
    _setup()
    with SessionLocal() as db:
        c = _campaign(db, target=3)
        for i in range(3):
            _qualified_prospect(db, c, f"p{i}", qualified=True)  # already at target, run went idle
        db.commit()

        c = db.get(Campaign, "c1")
        before_count = len(db.scalars(select(CampaignProspect)).all())
        result = pipeline.adjust_target(db, c, 8)

        assert result["previousTarget"] == 3
        assert result["targetCount"] == 8
        after_count = len(db.scalars(select(CampaignProspect)).all())
        assert after_count > before_count, "raising the target on an idle run should trigger fresh discovery"


def test_adjust_target_raise_is_noop_if_already_discovering():
    _setup()
    with SessionLocal() as db:
        c = _campaign(db, target=10)
        # one prospect still mid-pipeline (not yet qualified/rejected) - maybe_discover_more
        # should back off rather than double up on discovery while something is still pending
        db.add(CampaignProspect(id="p0", campaign_id=c.id, name="Pending One", state="ICP_PENDING"))
        db.commit()

        c = db.get(Campaign, "c1")
        before_count = len(db.scalars(select(CampaignProspect)).all())
        pipeline.adjust_target(db, c, 20)
        after_count = len(db.scalars(select(CampaignProspect)).all())
        assert after_count == before_count, "should not discover more while candidates are still pending ICP"


if __name__ == "__main__":
    test_adjust_target_rejects_non_live_campaign()
    test_adjust_target_rejects_campaign_with_no_run()
    test_adjust_target_lowers_without_touching_prospects()
    test_adjust_target_raise_triggers_more_discovery()
    test_adjust_target_raise_is_noop_if_already_discovering()
    print("adjust_target tests OK")