from typing import Final

from flamer.catalog import ACTIVE_STATUSES
from flamer.contract import ActionType, Remedy, RunAction, RunRecord, RunSettings, RunSpec
from flamer.seed import seed_records
from flamer.sim.engine import simulate_run

MIN: Final = 60_000
T0: Final = 1_793_268_000_000
DOMAINS: Final = ["brookings.edu", "rand.org", "urban.org", "wri.org", "cgdev.org", "bruegel.org", "csis.org"]
STANDARD: Final = RunSettings(concurrency=3, pace="standard", respect_robots=True)


def _run(domains: list[str], settings: RunSettings = STANDARD, actions: list[RunAction] | None = None) -> RunRecord:
    spec = RunSpec(
        id="run_test",
        name="Test run",
        mode="backfill",
        settings=settings,
        domains=domains,
        created_at=T0,
        created_by="Tester",
        seed=42,
    )
    return RunRecord(spec=spec, actions=actions or [])


def _action(
    at: float, action_type: ActionType, domains: list[str] | None = None, remedy: Remedy | None = None
) -> RunAction:
    action = RunAction(id=f"a{at}", at=at, type=action_type, actor="Tester")
    if domains is not None:
        action.domains = domains
    if remedy is not None:
        action.remedy = remedy
    return action


def test_is_a_pure_function_of_record_and_time() -> None:
    record = _run(DOMAINS)
    assert simulate_run(record, T0 + 7 * MIN) == simulate_run(record, T0 + 7 * MIN)


def test_never_decreases_counters_as_time_passes() -> None:
    record = _run(DOMAINS)
    previous = simulate_run(record, T0).counters
    for t in range(T0 + 30_000, T0 + 40 * MIN, 30_000):
        counters = simulate_run(record, t).counters
        assert counters.pages >= previous.pages
        assert counters.published >= previous.published
        assert counters.processed <= counters.downloaded <= counters.pdfs_found
        previous = counters


def test_respects_the_concurrency_limit() -> None:
    record = _run(DOMAINS)
    for t in range(T0, T0 + 40 * MIN, 20_000):
        assert sum(d.status in ACTIVE_STATUSES for d in simulate_run(record, t).domains) <= 3


def test_finishes_every_unblocked_domain_eventually() -> None:
    detail = simulate_run(_run(DOMAINS), T0 + 6 * 60 * MIN)
    assert all(d.status in ("completed", "needs_attention") for d in detail.domains)
    assert detail.status in ("completed", "blocked")
    assert detail.counters.published > 0


def test_freezes_progress_while_paused_and_continues_after_resume() -> None:
    record = _run(DOMAINS, actions=[_action(T0 + 3 * MIN, "pause_run"), _action(T0 + 13 * MIN, "resume_run")])
    a = simulate_run(record, T0 + 4 * MIN)
    b = simulate_run(record, T0 + 12 * MIN)
    assert a.status == "paused"
    assert b.counters == a.counters
    assert simulate_run(record, T0 + 16 * MIN).counters.pages > b.counters.pages


def test_cancels_every_unfinished_domain() -> None:
    detail = simulate_run(_run(DOMAINS, actions=[_action(T0 + 2 * MIN, "cancel_run")]), T0 + 30 * MIN)
    assert detail.status == "cancelled"
    assert all(d.status in ("completed", "cancelled") for d in detail.domains)


def test_blocks_a_captcha_domain_and_lets_an_operator_unblock_it() -> None:
    single = RunSettings(concurrency=1, pace="standard", respect_robots=True)
    blocked = simulate_run(_run(["who.int"], single), T0 + 60 * MIN).domains[0]
    assert (blocked.status, blocked.blocker) == ("needs_attention", "captcha")
    assert "solved_session" in blocked.remedies
    assert blocked.blocked_since is not None

    fix_at = blocked.blocked_since + MIN
    fixed = _run(["who.int"], single, [_action(fix_at, "resolve", ["who.int"], "solved_session")])
    after = simulate_run(fixed, fix_at + 1000).domains[0]
    assert after.attempt == 2
    assert after.status != "needs_attention"
    assert 0 <= after.progress - blocked.progress < 0.01


def test_routes_publisher_requests_through_a_waiting_state() -> None:
    assert simulate_run(_run(["ecb.europa.eu"]), T0 + 5 * MIN).domains[0].blocker == "robots"
    ask_at = T0 + 6 * MIN
    asked = _run(["ecb.europa.eu"], actions=[_action(ask_at, "resolve", ["ecb.europa.eu"], "request_permission")])
    assert simulate_run(asked, ask_at + 1000).domains[0].status == "waiting_owner"
    decided = simulate_run(asked, ask_at + 5 * MIN).domains[0]
    assert decided.owner_declined if decided.status == "needs_attention" else decided.attempt == 2


def test_ignores_robots_blocks_when_configured_not_to_respect_them() -> None:
    settings = RunSettings(concurrency=1, pace="standard", respect_robots=False)
    assert simulate_run(_run(["ecb.europa.eu"], settings), T0 + 5 * MIN).domains[0].status != "needs_attention"


def test_reports_per_minute_throughput_capped_at_an_hour() -> None:
    detail = simulate_run(_run(DOMAINS), T0 + 20 * MIN)
    assert len(detail.throughput) == 21
    assert len(simulate_run(_run(DOMAINS), T0 + 3 * 60 * MIN).throughput) == 60
    assert sum(p.pages for p in detail.throughput) > 0


def test_seed_data_is_lively() -> None:
    details = [simulate_run(r, T0) for r in seed_records(T0)]
    assert {"running", "cancelled"} <= {d.status for d in details}
    assert sum(d.attention for d in details) > 1
