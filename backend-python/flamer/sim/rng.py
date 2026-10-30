import math

from flamer import js

_MASK = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    return (a * b) & _MASK


def hash32(*parts: str | float) -> int:
    h1 = 0xDEADBEEF
    h2 = 0x41C6CE57
    for ch in "\u241f".join(part if isinstance(part, str) else js.format_number(part) for part in parts):
        c = ord(ch)
        h1 = _imul(h1 ^ c, 2654435761)
        h2 = _imul(h2 ^ c, 1597334677)
    h1 = _imul(h1 ^ (h1 >> 16), 2246822507) ^ _imul(h2 ^ (h2 >> 13), 3266489909)
    h2 = _imul(h2 ^ (h2 >> 16), 2246822507) ^ _imul(h1 ^ (h1 >> 13), 3266489909)
    return h1 ^ h2


class Rng:
    def __init__(self, seed: float) -> None:
        self._state = js.to_uint32(seed)

    def next(self) -> float:
        self._state = (self._state + 0x6D2B79F5) & _MASK
        t = self._state
        t = _imul(t ^ (t >> 15), t | 1)
        t ^= (t + _imul(t ^ (t >> 7), t | 61)) & _MASK
        return (t ^ (t >> 14)) / 4294967296

    def range(self, low: float, high: float) -> float:
        return low + self.next() * (high - low)

    def integer(self, low: int, high: int) -> int:
        return math.floor(low + self.next() * (high - low + 1))

    def chance(self, p: float) -> bool:
        return self.next() < p
