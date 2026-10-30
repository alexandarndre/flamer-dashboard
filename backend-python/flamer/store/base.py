from collections.abc import Callable, Sequence
from typing import Final, Protocol

from flamer.clock import Clock
from flamer.contract import RunAction, RunRecord, RunSpec, StoreKind

SHARED: Final = "shared"


class Store(Protocol):
    @property
    def kind(self) -> StoreKind: ...

    @property
    def durable(self) -> bool: ...

    async def list_runs(self) -> list[RunRecord]: ...

    async def get_run(self, run_id: str) -> RunRecord | None: ...

    async def create_run(self, spec: RunSpec) -> None: ...

    async def append_actions(self, run_id: str, actions: Sequence[RunAction]) -> None: ...

    async def seed_once(self, make: Callable[[], list[RunRecord]]) -> None: ...

    async def get_clock(self) -> Clock | None: ...

    async def set_clock(self, clock: Clock) -> None: ...

    async def reset(self) -> None: ...


type Stores = Callable[[str], Store]
