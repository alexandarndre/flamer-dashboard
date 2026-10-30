import math
import re
from typing import Final

WHITESPACE: Final = (
    "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006"
    "\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
)
MAX_TIME: Final = 8.64e15

_DECIMAL = re.compile(r"[+-]?(?:Infinity|(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)")
_RADIX = re.compile(r"0(?:[xX](?P<hex>[0-9a-fA-F]+)|[oO](?P<oct>[0-7]+)|[bB](?P<bin>[01]+))")
_BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz"


def trim(text: str) -> str:
    return text.strip(WHITESPACE)


def utf16_length(text: str) -> int:
    return len(text) + sum(1 for ch in text if ord(ch) > 0xFFFF)


def js_round(x: float) -> int:
    floor = math.floor(x)
    return floor + 1 if x - floor >= 0.5 else floor


def to_uint32(x: float) -> int:
    if isinstance(x, int):
        return x % 2**32
    return int(x) % 2**32 if math.isfinite(x) else 0


def parse_number(text: str) -> float:
    value = trim(text)
    if value == "":
        return 0.0
    if radix := _RADIX.fullmatch(value):
        digits, base = next((d, b) for d, b in zip(radix.groups(), (16, 8, 2), strict=True) if d is not None)
        try:
            return float(int(digits, base))
        except OverflowError:
            return math.inf
    if _DECIMAL.fullmatch(value) is None:
        return math.nan
    return float(value.replace("Infinity", "inf"))


def format_number(x: float) -> str:
    if math.isnan(x):
        return "NaN"
    if math.isinf(x):
        return "Infinity" if x > 0 else "-Infinity"
    if x == 0:
        return "0"
    if x < 0:
        return "-" + format_number(-x)
    mantissa, _, exponent = repr(float(x)).partition("e")
    whole, _, fraction = mantissa.partition(".")
    digits = (whole + fraction).lstrip("0")
    scale = (int(exponent) if exponent else 0) - len(fraction)
    stripped = digits.rstrip("0")
    scale += len(digits) - len(stripped)
    k = len(stripped)
    n = scale + k
    if k <= n <= 21:
        return stripped + "0" * (n - k)
    if 0 < n <= 21:
        return f"{stripped[:n]}.{stripped[n:]}"
    if -6 < n <= 0:
        return f"0.{'0' * -n}{stripped}"
    head = stripped[0] if k == 1 else f"{stripped[0]}.{stripped[1:]}"
    return f"{head}e{'+' if n - 1 >= 0 else '-'}{abs(n - 1)}"


def to_base36(n: int) -> str:
    if n < 0:
        return "-" + to_base36(-n)
    digits = ""
    while True:
        n, rest = divmod(n, 36)
        digits = _BASE36[rest] + digits
        if n == 0:
            return digits


def iso_string(t: float) -> str:
    if not math.isfinite(t) or abs(t) > MAX_TIME:
        raise ValueError("Invalid time value")
    days, ms = divmod(int(t), 86_400_000)
    year, month, day = _civil_from_days(days)
    hours, ms = divmod(ms, 3_600_000)
    minutes, ms = divmod(ms, 60_000)
    seconds, ms = divmod(ms, 1000)
    year_text = f"{year:04d}" if 0 <= year <= 9999 else f"{'+' if year > 0 else '-'}{abs(year):06d}"
    return f"{year_text}-{month:02d}-{day:02d}T{hours:02d}:{minutes:02d}:{seconds:02d}.{ms:03d}Z"


def _civil_from_days(days: int) -> tuple[int, int, int]:
    z = days + 719_468
    era = z // 146_097
    doe = z - era * 146_097
    yoe = (doe - doe // 1460 + doe // 36_524 - doe // 146_096) // 365
    doy = doe - (365 * yoe + yoe // 4 - yoe // 100)
    mp = (5 * doy + 2) // 153
    day = doy - (153 * mp + 2) // 5 + 1
    month = mp + 3 if mp < 10 else mp - 9
    return yoe + era * 400 + (1 if month <= 2 else 0), month, day
