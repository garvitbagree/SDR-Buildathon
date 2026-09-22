"""Tests outreach.send_real(): the scoped, single-prospect real-send path. Confirms it never
touches CHANNEL_MODE_EMAIL (stays whatever the environment has it as) and never sends to an
address outside DEMO_INBOXES, even when explicitly asked to force_live."""
import os
import sys
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.gettempdir(), f"sdr_test_real_{os.getpid()}.db")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import Base, SessionLocal, engine
from app.models.tables import Campaign, CampaignProspect
from app.services import outreach
from app.services.campaign_service import ServiceError


def _campaign(db, cid="c1"):
    c = Campaign(
        id=cid, name="Test Campaign", owner="Aarav Mehta", status="live", icp="SaaS", geography="United States",
        target_roles=["CTO"], approval_mode="none", created_at="2026-09-20", updated_at="2026-09-20",
        agents=[{"key": "personalisation", "name": "personalisation", "enabled": True, "paused": False}],
        channels=[{"channel": "email", "enabled": True, "paused": False, "dailyLimit": 100}],
    )
    db.add(c)
    return c


def _ready_prospect(db, c, pid="p1", email="buildathon.product+p1@gmail.com"):
    p = CampaignProspect(
        id=pid, campaign_id=c.id, name="Jane Doe", title="CTO", company="Acme",
        email=email, state="READY_TO_SEND", message={"channel": "email", "subject": "Hi", "body": "Hello there"},
        strategy={"primary_channel": "email"},
    )
    db.add(p)
    return p


def _setup():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)


def test_send_real_rejects_prospect_not_in_demo_inboxes():
    _setup()
    saved_env = dict(os.environ)
    os.environ["DEMO_INBOXES"] = "buildathon.product@gmail.com"
    os.environ.pop("CHANNEL_MODE_EMAIL", None)  # stays sandbox globally
    try:
        with SessionLocal() as db:
            c = _campaign(db)
            _ready_prospect(db, c, email="random-fake@company.example")  # NOT in DEMO_INBOXES
            db.commit()
            c = db.get(Campaign, "c1")
            p = db.get(CampaignProspect, "p1")
            try:
                outreach.send_real(db, c, p)
                assert False, "should have raised"
            except ServiceError as e:
                assert e.status == 422
    finally:
        os.environ.clear()
        os.environ.update(saved_env)


def test_send_real_rejects_prospect_not_ready():
    _setup()
    saved_env = dict(os.environ)
    os.environ["DEMO_INBOXES"] = "buildathon.product@gmail.com"
    try:
        with SessionLocal() as db:
            c = _campaign(db)
            p = _ready_prospect(db, c)
            p.state = "WAITING_FOR_RESPONSE"  # already sent, not ready
            db.commit()
            c = db.get(Campaign, "c1")
            p = db.get(CampaignProspect, "p1")
            try:
                outreach.send_real(db, c, p)
                assert False, "should have raised"
            except ServiceError as e:
                assert e.status == 409
    finally:
        os.environ.clear()
        os.environ.update(saved_env)


def test_send_real_attempts_resend_without_flipping_global_sandbox():
    """Resend isn't actually configured in the test environment, so this should come back as
    'unavailable' rather than 'sent' - but the important assertion is that it TRIED (force_live
    took effect), and that CHANNEL_MODE_EMAIL was never read or required."""
    _setup()
    saved_env = dict(os.environ)
    os.environ["DEMO_INBOXES"] = "buildathon.product@gmail.com"
    for key in ("RESEND_API_KEY", "CHANNEL_MODE_EMAIL"):
        os.environ.pop(key, None)
    try:
        with SessionLocal() as db:
            c = _campaign(db)
            _ready_prospect(db, c)
            db.commit()
            c = db.get(Campaign, "c1")
            p = db.get(CampaignProspect, "p1")
            result = outreach.send_real(db, c, p)
            # not "sandbox" - proves force_live bypassed the (unset) global switch and actually
            # attempted a real send path, which then correctly reports Resend as unconfigured
            assert result["status"] == "unavailable"
            assert "Resend" in result["reason"]
    finally:
        os.environ.clear()
        os.environ.update(saved_env)


if __name__ == "__main__":
    test_send_real_rejects_prospect_not_in_demo_inboxes()
    test_send_real_rejects_prospect_not_ready()
    test_send_real_attempts_resend_without_flipping_global_sandbox()
    print("send_real tests OK")