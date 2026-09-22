"""Tests Worker._tick()'s per-campaign inflight cap in isolation from actual job execution -
pool.submit is stubbed out so this only checks the SCHEDULING decision (which jobs get marked
"running" this tick), not what running them would do."""
import os
import sys
import tempfile
from collections import Counter
from datetime import timedelta

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.gettempdir(), f"sdr_test_cap_{os.getpid()}.db")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from app.db import Base, SessionLocal, engine
from app.models.tables import AgentJob, Campaign, utcnow
from app.services.pipeline import Worker


class _FakeFuture:
    def add_done_callback(self, cb):
        pass  # this test only checks scheduling, never lets a job actually run


def _campaign(db, cid):
    db.add(Campaign(
        id=cid, name=f"Campaign {cid}", owner="Aarav Mehta", status="live", icp="SaaS", geography="United States",
        target_roles=["CTO"], approval_mode="none", created_at="2026-09-20", updated_at="2026-09-20",
        agents=[], channels=[{"channel": "email", "enabled": True, "paused": False, "dailyLimit": 100}],
    ))


def _jobs(db, cid, n, agent="research"):
    for i in range(n):
        db.add(AgentJob(
            id=f"j_{cid}_{i}", campaign_id=cid, prospect_id=f"p_{cid}_{i}", agent=agent,
            status="queued", attempts=0, max_attempts=3, run_after=utcnow() - timedelta(seconds=1),
        ))


def _setup():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)


def _running_counts(db):
    rows = db.scalars(select(AgentJob).where(AgentJob.status == "running")).all()
    return Counter(j.campaign_id for j in rows)


def test_two_campaigns_split_evenly_when_both_have_work():
    _setup()
    with SessionLocal() as db:
        _campaign(db, "c1")
        _campaign(db, "c2")
        _jobs(db, "c1", 3)
        _jobs(db, "c2", 3)
        db.commit()

    w = Worker.__new__(Worker)  # bypass __init__'s real ThreadPoolExecutor
    w.concurrency = 2
    w.inflight, w.inflight_campaign = set(), {}
    import threading
    w.lock = threading.Lock()

    class _FakePool:
        def submit(self, fn, jid):
            return _FakeFuture()
    w.pool = _FakePool()

    w._tick()

    with SessionLocal() as db:
        counts = _running_counts(db)
    assert counts == {"c1": 1, "c2": 1}, counts


def test_single_campaign_gets_full_concurrency_when_alone():
    _setup()
    with SessionLocal() as db:
        _campaign(db, "c1")
        _campaign(db, "c2")
        _jobs(db, "c1", 5)  # c2 has no jobs ready at all this tick
        db.commit()

    w = Worker.__new__(Worker)
    w.concurrency = 2
    w.inflight, w.inflight_campaign = set(), {}
    import threading
    w.lock = threading.Lock()

    class _FakePool:
        def submit(self, fn, jid):
            return _FakeFuture()
    w.pool = _FakePool()

    w._tick()

    with SessionLocal() as db:
        counts = _running_counts(db)
    assert counts == {"c1": 2}, counts


def test_campaign_already_at_cap_is_skipped_in_favor_of_others():
    _setup()
    with SessionLocal() as db:
        _campaign(db, "c1")
        _campaign(db, "c2")
        _jobs(db, "c1", 3)
        _jobs(db, "c2", 3)
        db.commit()

    w = Worker.__new__(Worker)
    w.concurrency = 2
    w.inflight = {"already_running_job"}
    w.inflight_campaign = {"already_running_job": "c1"}  # c1 already has 1 of its share of 1 (cap = ceil(2/2))
    import threading
    w.lock = threading.Lock()

    class _FakePool:
        def submit(self, fn, jid):
            return _FakeFuture()
    w.pool = _FakePool()

    w._tick()

    with SessionLocal() as db:
        counts = _running_counts(db)
    # only 1 free slot this tick (concurrency 2 - 1 already inflight), and it should go to c2,
    # since c1 is already at its cap of 1
    assert counts == {"c2": 1}, counts


if __name__ == "__main__":
    test_two_campaigns_split_evenly_when_both_have_work()
    test_single_campaign_gets_full_concurrency_when_alone()
    test_campaign_already_at_cap_is_skipped_in_favor_of_others()
    print("worker campaign cap tests OK")