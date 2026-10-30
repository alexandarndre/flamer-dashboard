import time

from flamer import js
from flamer.contract import DemoSpeed, Millis, Model


class Clock(Model):
    anchor_real: Millis
    anchor_sim: Millis
    speed: DemoSpeed


def wall_clock_ms() -> float:
    return time.time_ns() // 1_000_000


def demo_time(clock: Clock | None, real: float) -> float:
    return real if clock is None else js.js_round(clock.anchor_sim + (real - clock.anchor_real) * clock.speed)
