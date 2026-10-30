from collections.abc import Callable, Sequence
from typing import Literal

from flamer.clock import Clock
from flamer.contract import RunAction, RunRecord, RunSpec


class MemoryStore:
    kind: Literal["memory"] = "memory"
    durable = False

    def __init__(self) -> None:
        self._runs: dict[str, RunRecord] = {}
        self._seeded = False
        self._clock: Clock | None = None

    async def list_runs(self) -> list[RunRecord]:
        return [_clone(record) for record in self._runs.values()]

    async def get_run(self, run_id: str) -> RunRecord | None:
        record = self._runs.get(run_id)
        return None if record is None else _clone(record)

    async def create_run(self, spec: RunSpec) -> None:
        self._runs[spec.id] = RunRecord(spec=spec, actions=[])

    async def append_actions(self, run_id: str, actions: Sequence[RunAction]) -> None:
        record = self._runs.get(run_id)
        if record is not None:
            record.actions.extend(actions)

    async def seed_once(self, make: Callable[[], list[RunRecord]]) -> None:
        if self._seeded:
            return
        self._seeded = True
        for record in make():
            self._runs[record.spec.id] = record

    async def get_clock(self) -> Clock | None:
        return self._clock

    async def set_clock(self, clock: Clock) -> None:
        self._clock = clock

    async def reset(self) -> None:
        self._runs.clear()
        self._seeded = False
        self._clock = None


class MemoryStores:
    def __init__(self) -> None:
        self._stores: dict[str, MemoryStore] = {}

    def __call__(self, namespace: str) -> MemoryStore:
        store = self._stores.get(namespace)
        if store is None:
            store = self._stores[namespace] = MemoryStore()
        return store


def _clone(record: RunRecord) -> RunRecord:
    return RunRecord(spec=record.spec, actions=list(record.actions))
