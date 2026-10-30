import asyncio
import math
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Annotated, Final

from fastapi import Depends, Header, Request, Response

from flamer import js
from flamer.clock import Clock, demo_time, wall_clock_ms
from flamer.contract import DemoState, Runtime
from flamer.errors import NO_STORE
from flamer.seed import seed_records
from flamer.sse import StreamTiming
from flamer.store.base import SHARED, Store, Stores

SANDBOX_HEADER: Final = "x-flamer-sandbox"
SANDBOX_ID: Final = re.compile(r"[a-z0-9]{12,40}")


class Seeder:
    def __init__(self) -> None:
        self._seeded: set[str] = set()
        self._locks: dict[str, asyncio.Lock] = {}

    async def ensure(self, namespace: str, store: Store, now: float) -> None:
        if namespace in self._seeded:
            return
        lock = self._locks.get(namespace)
        if lock is None:
            lock = self._locks[namespace] = asyncio.Lock()
        async with lock:
            if namespace not in self._seeded:
                await store.seed_once(lambda: seed_records(now))
                self._seeded.add(namespace)

    def forget(self, namespace: str) -> None:
        self._seeded.discard(namespace)


@dataclass(frozen=True, slots=True)
class Services:
    stores: Stores
    runtime: Runtime = "python"
    sandboxes: bool = True
    real_now: Callable[[], float] = wall_clock_ms
    stream: StreamTiming = field(default_factory=StreamTiming)
    seeder: Seeder = field(default_factory=Seeder)


@dataclass(frozen=True, slots=True)
class Scope:
    services: Services
    store: Store
    namespace: str
    clock: Clock | None

    def now(self) -> float:
        return demo_time(self.clock, self.services.real_now())

    def at(self, raw: str | None) -> float:
        t = math.nan if raw is None else js.parse_number(raw)
        return min(t, self.now()) if math.isfinite(t) else self.now()

    def demo_state(self, clock: Clock | None) -> DemoState:
        real_now = self.services.real_now
        return DemoState(
            speed=1 if clock is None else clock.speed,
            now=demo_time(clock, real_now()),
            real_now=real_now(),
            sandbox=None if self.namespace == SHARED else self.namespace,
        )


def get_services(request: Request) -> Services:
    services = request.app.state.services
    if not isinstance(services, Services):
        raise TypeError("App was created without services")
    return services


async def get_scope(
    request: Request,
    services: Annotated[Services, Depends(get_services)],
    sandbox: Annotated[
        str | None,
        Header(
            alias=SANDBOX_HEADER,
            description="Visitor sandbox id. Without it you read and write the shared dataset.",
            json_schema_extra={"pattern": SANDBOX_ID.pattern},
        ),
    ] = None,
) -> Scope:
    requested = sandbox if sandbox is not None else next(iter(request.query_params.getlist("sandbox")), "")
    namespace = requested if services.sandboxes and SANDBOX_ID.fullmatch(requested) else SHARED
    store = services.stores(namespace)
    scope = Scope(services=services, store=store, namespace=namespace, clock=await store.get_clock())
    await services.seeder.ensure(namespace, store, scope.now())
    return scope


def no_store(response: Response) -> None:
    response.headers.update(NO_STORE)


ScopeDep = Annotated[Scope, Depends(get_scope)]
