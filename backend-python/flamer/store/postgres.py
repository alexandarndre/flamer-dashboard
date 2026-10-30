from collections.abc import Callable, Sequence
from typing import Literal

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

from flamer.clock import Clock
from flamer.contract import RunAction, RunRecord, RunSpec
from flamer.store.schema import namespaces, run_actions, runs


def async_database_url(url: str) -> str:
    parsed = make_url(url)
    if parsed.drivername in ("postgres", "postgresql", "postgresql+psycopg2", "postgresql+psycopg"):
        parsed = parsed.set(drivername="postgresql+asyncpg")
    return parsed.render_as_string(hide_password=False)


def create_engine(url: str) -> AsyncEngine:
    return create_async_engine(async_database_url(url), pool_pre_ping=True)


class PostgresStore:
    kind: Literal["postgres"] = "postgres"
    durable = True

    def __init__(self, engine: AsyncEngine, namespace: str) -> None:
        self._engine = engine
        self._namespace = namespace

    async def list_runs(self) -> list[RunRecord]:
        async with self._engine.connect() as conn:
            specs = await conn.execute(
                select(runs.c.spec).where(runs.c.namespace == self._namespace).order_by(runs.c.created_at, runs.c.id)
            )
            actions = await conn.execute(
                select(run_actions.c.run_id, run_actions.c.action)
                .where(run_actions.c.namespace == self._namespace)
                .order_by(run_actions.c.seq)
            )
        records = {spec.id: RunRecord(spec=spec, actions=[]) for spec in map(RunSpec.model_validate, specs.scalars())}
        for run_id, action in actions:
            if (record := records.get(run_id)) is not None:
                record.actions.append(RunAction.model_validate(action))
        return list(records.values())

    async def get_run(self, run_id: str) -> RunRecord | None:
        async with self._engine.connect() as conn:
            spec = await conn.scalar(
                select(runs.c.spec).where(runs.c.namespace == self._namespace, runs.c.id == run_id)
            )
            if spec is None:
                return None
            actions = await conn.scalars(
                select(run_actions.c.action)
                .where(run_actions.c.namespace == self._namespace, run_actions.c.run_id == run_id)
                .order_by(run_actions.c.seq)
            )
            return RunRecord(spec=RunSpec.model_validate(spec), actions=[RunAction.model_validate(a) for a in actions])

    async def create_run(self, spec: RunSpec) -> None:
        async with self._engine.begin() as conn:
            await conn.execute(insert(namespaces).values(name=self._namespace).on_conflict_do_nothing())
            await self._insert_records(conn, [RunRecord(spec=spec, actions=[])])

    async def append_actions(self, run_id: str, actions: Sequence[RunAction]) -> None:
        if not actions:
            return
        async with self._engine.begin() as conn:
            await conn.execute(insert(run_actions), [self._action_row(run_id, action) for action in actions])

    async def seed_once(self, make: Callable[[], list[RunRecord]]) -> None:
        claim = (
            insert(namespaces)
            .values(name=self._namespace, seeded_at=func.now())
            .on_conflict_do_update(
                index_elements=[namespaces.c.name],
                set_={"seeded_at": func.now()},
                where=namespaces.c.seeded_at.is_(None),
            )
            .returning(namespaces.c.name)
        )
        async with self._engine.begin() as conn:
            if await conn.scalar(claim) is None:
                return
            await self._insert_records(conn, make())

    async def get_clock(self) -> Clock | None:
        async with self._engine.connect() as conn:
            raw = await conn.scalar(select(namespaces.c.clock).where(namespaces.c.name == self._namespace))
        return None if raw is None else Clock.model_validate(raw)

    async def set_clock(self, clock: Clock) -> None:
        value = clock.model_dump(mode="json")
        statement = insert(namespaces).values(name=self._namespace, clock=value)
        async with self._engine.begin() as conn:
            await conn.execute(
                statement.on_conflict_do_update(
                    index_elements=[namespaces.c.name], set_={"clock": statement.excluded.clock}
                )
            )

    async def reset(self) -> None:
        async with self._engine.begin() as conn:
            await conn.execute(delete(namespaces).where(namespaces.c.name == self._namespace))

    async def _insert_records(self, conn: AsyncConnection, records: Sequence[RunRecord]) -> None:
        if not records:
            return
        await conn.execute(
            insert(runs),
            [
                {
                    "namespace": self._namespace,
                    "id": r.spec.id,
                    "created_at": int(r.spec.created_at),
                    "spec": r.spec.model_dump(mode="json", exclude_unset=True),
                }
                for r in records
            ],
        )
        rows = [self._action_row(r.spec.id, action) for r in records for action in r.actions]
        if rows:
            await conn.execute(insert(run_actions), rows)

    def _action_row(self, run_id: str, action: RunAction) -> dict[str, object]:
        return {
            "namespace": self._namespace,
            "run_id": run_id,
            "action_id": action.id,
            "action": action.model_dump(mode="json", exclude_unset=True),
        }


class PostgresStores:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine

    def __call__(self, namespace: str) -> PostgresStore:
        return PostgresStore(self.engine, namespace)
