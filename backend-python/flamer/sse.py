import asyncio
import logging
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass

from pydantic import TypeAdapter

from flamer import js
from flamer.aggregate import overview_of, pulse_of, simulate_all
from flamer.clock import Clock, demo_time
from flamer.contract import CrawlEvent
from flamer.store.base import Store

logger = logging.getLogger(__name__)

_EVENTS = TypeAdapter(list[CrawlEvent])


@dataclass(frozen=True, slots=True)
class StreamTiming:
    tick_ms: float = 2000
    lifetime_ms: float = 55_000
    refresh_ms: float = 4000


def _key(event: CrawlEvent) -> str:
    return f"{js.format_number(event.at)}|{event.run_id}|{'' if event.domain is None else event.domain}|{event.message}"


def _message(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"


async def live_events(
    store: Store, clock: Clock | None, real_now: Callable[[], float], timing: StreamTiming
) -> AsyncIterator[str]:
    started = real_now()
    records = await store.list_runs()
    loaded_at = started
    yield "retry: 1500\n\n"
    first = demo_time(clock, started)
    seen = {_key(e) for e in overview_of(simulate_all(records, first), first).events}
    while True:
        try:
            real = real_now()
            if real - loaded_at >= timing.refresh_ms:
                records, clock = await asyncio.gather(store.list_runs(), store.get_clock())
                loaded_at = real
            t = demo_time(clock, real)
            overview = overview_of(simulate_all(records, t), t)
            fresh = [e for e in reversed(overview.events) if _key(e) not in seen]
            seen.update(_key(e) for e in fresh)
        except Exception:
            logger.exception("Live stream failed")
            return
        yield _message("pulse", pulse_of(overview).model_dump_json(exclude_unset=True))
        if fresh:
            yield _message("activity", _EVENTS.dump_json(fresh, exclude_unset=True).decode())
        if real - started >= timing.lifetime_ms:
            return
        await asyncio.sleep(timing.tick_ms / 1000)
