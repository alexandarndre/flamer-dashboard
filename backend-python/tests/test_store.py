import asyncio

import pytest

from flamer.clock import Clock
from flamer.contract import RunAction, RunRecord, RunSettings, RunSpec
from flamer.seed import seed_records
from flamer.store.base import Stores
from tests.conftest import T0

pytestmark = pytest.mark.anyio


def _spec(run_id: str, created_at: float) -> RunSpec:
    return RunSpec(
        id=run_id,
        name=f"Run {run_id}",
        mode="backfill",
        settings=RunSettings(concurrency=2, pace="standard", respect_robots=True),
        domains=["who.int"],
        created_at=created_at,
        created_by="Tester",
        seed=7,
    )


def _action(action_id: str, at: float) -> RunAction:
    return RunAction(id=action_id, at=at, type="pause", actor="Tester", domains=["who.int"])


async def test_round_trips_runs_and_actions_in_order(stores: Stores) -> None:
    store = stores("contract0000001")
    await store.create_run(_spec("run_b", T0 + 1))
    await store.create_run(_spec("run_a", T0))
    await store.append_actions("run_b", [_action("x2", T0 + 5), _action("x1", T0 + 2)])
    await store.append_actions("run_b", [_action("x3", T0 + 3.5)])

    record = await store.get_run("run_b")
    assert record is not None
    assert [a.id for a in record.actions] == ["x2", "x1", "x3"]
    assert record.actions[2].at == T0 + 3.5
    assert record.actions[0].model_dump(exclude_unset=True).keys() == {"id", "at", "type", "actor", "domains"}
    assert "recrawl_every_days" not in record.spec.settings.model_fields_set
    assert sorted(r.spec.id for r in await store.list_runs()) == ["run_a", "run_b"]
    assert await store.get_run("run_missing") is None


async def test_keeps_namespaces_apart(stores: Stores) -> None:
    await stores("contract0000001").create_run(_spec("run_a", T0))
    assert await stores("contract0000002").list_runs() == []
    assert await stores("contract0000002").get_run("run_a") is None


async def test_seeds_once_until_reset(stores: Stores) -> None:
    store = stores("contract0000001")
    await store.seed_once(lambda: seed_records(T0))
    await store.seed_once(lambda: seed_records(T0 + 1))
    runs = await store.list_runs()
    assert sorted(r.spec.id for r in runs) == [
        "run_health_ngos",
        "run_igo_weekly",
        "run_stats_pilot",
        "run_think_tanks_b3",
    ]
    assert next(r for r in runs if r.spec.id == "run_stats_pilot").spec.created_at == T0 - 26 * 60 * 60_000

    await store.set_clock(Clock(anchor_real=T0, anchor_sim=T0 + 0.5, speed=60))
    await store.reset()
    assert await store.list_runs() == []
    assert await store.get_clock() is None
    await store.seed_once(lambda: seed_records(T0))
    assert len(await store.list_runs()) == 4


async def test_seeds_once_under_concurrency(stores: Stores) -> None:
    calls: list[int] = []

    def make() -> list[RunRecord]:
        calls.append(1)
        return seed_records(T0)

    await asyncio.gather(*(stores("contract0000003").seed_once(make) for _ in range(5)))
    assert len(calls) == 1
    assert len(await stores("contract0000003").list_runs()) == 4


async def test_round_trips_the_demo_clock(stores: Stores) -> None:
    store = stores("contract0000001")
    assert await store.get_clock() is None
    await store.set_clock(Clock(anchor_real=T0, anchor_sim=T0 + 0.5, speed=10))
    await store.set_clock(Clock(anchor_real=T0, anchor_sim=T0 + 1.5, speed=60))
    assert await store.get_clock() == Clock(anchor_real=T0, anchor_sim=T0 + 1.5, speed=60)
    assert await stores("contract0000002").get_clock() is None
