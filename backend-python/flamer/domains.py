import re
from dataclasses import dataclass
from typing import Final

from flamer import js
from flamer.contract import InvalidDomain, ParsedDomains
from flamer.urlhost import hostname

_LABEL: Final = re.compile(r"(?!-)[a-z0-9-]{1,63}(?<!-)")
_TLD: Final = re.compile(r"[a-z]{2,63}|xn--[a-z0-9-]{1,59}")
_HEADER: Final = re.compile(r"domains?|urls?|websites?|sites?|hosts?", re.IGNORECASE | re.ASCII)
_SCHEME: Final = re.compile(r"[a-z][a-z0-9+.\-]*://", re.IGNORECASE | re.ASCII)
_QUOTES: Final = re.compile(r"\A[\"']|[\"']\Z")
_SPACE: Final = re.compile(f"[{re.escape(js.WHITESPACE)}]")
_WWW: Final = re.compile(r"\Awww[0-9]?\.")
_IPV4: Final = re.compile(r"[0-9]+(?:\.[0-9]+){3}")
_SEPARATORS: Final = re.compile(r"[\n,;\t]+")


@dataclass(frozen=True, slots=True)
class Rejected:
    reason: str


def normalize_domain(raw: str) -> str | Rejected:
    value = _QUOTES.sub("", js.trim(raw))
    if value == "":
        return Rejected("Empty value")
    if _SPACE.search(value):
        return Rejected("Contains spaces")
    host = hostname(value if _SCHEME.match(value) else f"https://{value}")
    if host is None:
        return Rejected("Not a web address")
    host = _WWW.sub("", host.lower()).removesuffix(".")
    if _IPV4.fullmatch(host) or host.startswith("["):
        return Rejected("IP addresses are not crawlable sources")
    labels = host.split(".")
    if len(labels) < 2:
        return Rejected("Missing top-level domain (e.g. .org)")
    if _TLD.fullmatch(labels[-1]) is None:
        return Rejected("Unknown top-level domain")
    if not all(_LABEL.fullmatch(label) for label in labels):
        return Rejected("Invalid characters in domain")
    if len(host) > 253:
        return Rejected("Domain is too long")
    return host


def parse_domain_list(text: str) -> ParsedDomains:
    seen: set[str] = set()
    result = ParsedDomains(valid=[], duplicates=[], invalid=[])
    for token in _SEPARATORS.split(text):
        trimmed = js.trim(token)
        if trimmed == "" or trimmed.startswith("#") or _HEADER.fullmatch(trimmed):
            continue
        normalized = normalize_domain(token)
        if isinstance(normalized, Rejected):
            result.invalid.append(InvalidDomain(input=trimmed, reason=normalized.reason))
        elif normalized in seen:
            result.duplicates.append(normalized)
        else:
            seen.add(normalized)
            result.valid.append(normalized)
    return result
