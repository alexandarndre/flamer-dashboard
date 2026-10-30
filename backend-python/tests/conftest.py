import os
from collections.abc import AsyncIterator, Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import httpx
import pytest
from alembic import command
from alembic.config import Config

from flamer.app import create_app
from flamer.scope import Services
from flamer.sse import StreamTiming
from flamer.store.base import Stores
from flamer.store.memory import MemoryStores
from flamer.store.postgres import PostgresStores, create_engine

TEST_DATABASE_URL: Final = os.environ.get("TEST_DATABASE_URL", "")
PROJECT: Final = Path(__file__).resolve().parents[1]
T0: Final = 1_793_268_000_000
BACKENDS: Final = [
    "memory",
    pytest.param("postgres", marks=pytest.mark.skipif(TEST_DATABASE_URL == "", reason="TEST_DATABASE_URL not set")),
]


@dataclass
class FakeClock:
    now: float = T0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def _migrate(step: Callable[[Config, str], None], revision: str) -> None:
    config = Config(PROJECT / "alembic.ini")
    config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL.replace("%", "%%"))
    with ThreadPoolExecutor(max_workers=1) as pool:
        pool.submit(step, config, revision).result()


@pytest.fixture(scope="session")
def migrated_database() -> Iterator[str]:
    _migrate(command.downgrade, "base")
    _migrate(command.upgrade, "head")
    yield TEST_DATABASE_URL
    _migrate(command.downgrade, "base")


@pytest.fixture(params=BACKENDS)
async def stores(request: pytest.FixtureRequest) -> AsyncIterator[Stores]:
    if request.param == "memory":
        yield MemoryStores()
        return
    engine = create_engine(request.getfixturevalue("migrated_database"))
    async with engine.begin() as conn:
        await conn.exec_driver_sql("TRUNCATE namespaces CASCADE")
    yield PostgresStores(engine)
    await engine.dispose()


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
async def client(stores: Stores, clock: FakeClock) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app(Services(stores=stores, real_now=clock, stream=StreamTiming(lifetime_ms=0)))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as http:
        yield http
