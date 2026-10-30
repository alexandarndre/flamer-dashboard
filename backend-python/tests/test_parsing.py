import math

import pytest

from flamer import js
from flamer.domains import Rejected, normalize_domain, parse_domain_list
from flamer.sim.rng import Rng, hash32


def test_normalizes_dedupes_and_explains_rejects() -> None:
    parsed = parse_domain_list(
        "domain\nhttps://www.WHO.int/publications\nwho.int\noecd.org, imf\n10.0.0.1\nbad_domain.org"
    )
    assert parsed.valid == ["who.int", "oecd.org"]
    assert parsed.duplicates == ["who.int"]
    assert [i.input for i in parsed.invalid] == ["imf", "10.0.0.1", "bad_domain.org"]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("münchen.de", "xn--mnchen-3ya.de"),
        ("WWW2.oecd.org.", "oecd.org"),
        ("user:pass@who.int:8080/x?y#z", "who.int"),
        ("wh%6F.int", "who.int"),
        ("\uff57\uff48\uff4f.int", "who.int"),
        ("0x7f.1", Rejected("IP addresses are not crawlable sources")),
        ("[::1]", Rejected("IP addresses are not crawlable sources")),
        ("foo.123", Rejected("Not a web address")),
        ("who.int:99999", Rejected("Not a web address")),
        ("a\u3000b.org", Rejected("Contains spaces")),
        ('"odi.org"', "odi.org"),
        ("x.\U0001f600", "x.xn--e28h"),
    ],
)
def test_parses_hosts_like_the_whatwg_url_parser(raw: str, expected: str | Rejected) -> None:
    assert normalize_domain(raw) == expected


def test_hashes_and_draws_like_the_typescript_engine() -> None:
    assert hash32("profile", "who.int") == hash32("profile", "who.int")
    assert hash32("attempt", 42, "who.int", 1, "-") == hash32("attempt␟42␟who.int␟1␟-")
    r = Rng(1234567)
    draws = [r.next() for _ in range(1000)]
    assert all(0 <= x < 1 for x in draws)
    assert Rng(-1).next() == Rng(2**32 - 1).next()


@pytest.mark.parametrize(
    ("x", "expected"),
    [
        (0.5, 1),
        (1.5, 2),
        (2.5, 3),
        (-0.5, 0),
        (-1.5, -1),
        (0.49999999999999994, 0),
        (4503599627370497, 4503599627370497),
    ],
)
def test_rounds_like_math_round(x: float, expected: int) -> None:
    assert js.js_round(x) == expected


@pytest.mark.parametrize(
    ("x", "expected"),
    [(1793264052000.0, "1793264052000"), (1e-7, "1e-7"), (1.5e-5, "0.000015"), (1e21, "1e+21"), (0.1, "0.1")],
)
def test_formats_numbers_like_javascript(x: float, expected: str) -> None:
    assert js.format_number(x) == expected


@pytest.mark.parametrize(
    ("text", "expected"),
    [("", 0.0), (" 12 ", 12.0), ("0x10", 16.0), ("1e3", 1000.0), ("-Infinity", -math.inf), (".5", 0.5)],
)
def test_parses_numbers_like_javascript(text: str, expected: float) -> None:
    assert js.parse_number(text) == expected


@pytest.mark.parametrize("text", ["12abc", "1_0", "inf", "-0x10", "."])
def test_rejects_what_javascript_rejects(text: str) -> None:
    assert math.isnan(js.parse_number(text))


def test_formats_iso_dates_like_javascript() -> None:
    assert js.iso_string(1793274334681.081) == "2026-10-29T11:45:34.681Z"
    assert js.iso_string(-1) == "1969-12-31T23:59:59.999Z"
    assert js.iso_string(253402300800000) == "+010000-01-01T00:00:00.000Z"
    with pytest.raises(ValueError, match="Invalid time value"):
        js.iso_string(9e15)


def test_counts_utf16_code_units_and_trims_js_whitespace() -> None:
    assert js.utf16_length("a\U0001f600") == 3
    assert js.trim("\ufeff x \u3000") == "x"
    assert js.trim("\x1c x") == "\x1c x"
