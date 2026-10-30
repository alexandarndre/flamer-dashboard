import math
from dataclasses import dataclass, replace
from typing import Final, Literal, TypedDict

from flamer import js
from flamer.catalog import PACE_FACTOR
from flamer.contract import REJECT_REASONS, Blocker, Counters, RejectReason, Remedy, RunMode, RunSettings
from flamer.sim.rng import Rng, hash32

MAP_END: Final = 0.3
DOWNLOAD_END: Final = 0.85
PROCESS_START: Final = 0.4


@dataclass(frozen=True, slots=True)
class DomainProfile:
    tendency: Blocker | None
    pages: int
    pdf_ratio: float
    alt_pdf_ratio: float
    dup_ratio: float
    upd_ratio: float
    reject_ratio: float
    reject_mix: dict[RejectReason, float]
    flaky: float


@dataclass(frozen=True, slots=True)
class Episode:
    at: float
    dur_sec: float
    kind: Literal["rate_limited", "timeout"]


@dataclass(frozen=True, slots=True)
class AttemptPlan:
    blocker: Blocker | None
    fail_at: float | None
    episodes: tuple[Episode, ...]
    duration_sec: float


class _Override(TypedDict, total=False):
    tendency: Blocker | None
    pages: int
    pdf_ratio: float
    flaky: float


KNOWN: Final[dict[str, _Override]] = {
    "who.int": {"tendency": "captcha", "pages": 9200},
    "imf.org": {"tendency": "unstable"},
    "ecb.europa.eu": {"tendency": "robots"},
    "wto.org": {"tendency": "waf", "pages": 7800},
    "unhcr.org": {"tendency": "login"},
    "iaea.org": {"tendency": None, "flaky": 0.9},
    "worldbank.org": {"tendency": None, "pages": 14800, "pdf_ratio": 0.34},
    "oecd.org": {"tendency": None, "pages": 11800},
    "unicef.org": {"tendency": None},
    "cfr.org": {"tendency": "waf"},
    "sipri.org": {"tendency": "no_pdfs"},
    "piie.com": {"tendency": "tls"},
    "odi.org": {"tendency": "captcha"},
    "gavi.org": {"tendency": "robots"},
    "ippf.org": {"tendency": "captcha"},
    "plan-international.org": {"tendency": "waf"},
    "path.org": {"tendency": None},
    "msf.org": {"tendency": None, "pages": 6400},
    "savethechildren.net": {"tendency": "dns"},
    "care.org": {"tendency": None},
    "e3g.org": {"tendency": None},
}

TENDENCIES: Final[tuple[tuple[Blocker | None, float], ...]] = (
    (None, 0.8),
    ("captcha", 0.05),
    ("waf", 0.04),
    ("robots", 0.03),
    ("no_pdfs", 0.02),
    ("login", 0.02),
    ("unstable", 0.015),
    ("tls", 0.015),
    ("dns", 0.01),
)

REMEDY_SUCCESS: Final[dict[Blocker, dict[Remedy, float]]] = {
    "captcha": {"retry": 0.15, "solved_session": 0.9},
    "waf": {"retry": 0.3, "slow_down": 0.75},
    "robots": {},
    "login": {"add_credentials": 0.92},
    "dns": {"retry": 0.3},
    "tls": {"allow_insecure": 0.95, "retry": 0.2},
    "no_pdfs": {"add_entry_point": 0.9},
    "unstable": {"retry": 0.55, "slow_down": 0.85},
}

OWNER_APPROVAL: Final[dict[Remedy, float]] = {"request_allowlist": 0.75, "request_permission": 0.6}


def profile_of(domain: str) -> DomainProfile:
    r = Rng(hash32("profile", domain))
    roll = r.next()
    tendency: Blocker | None = None
    for candidate, weight in TENDENCIES:
        roll -= weight
        if roll < 0:
            tendency = candidate
            break
    weights = [r.range(0.2, 1) for _ in REJECT_REASONS]
    total = 0.0
    for weight in weights:
        total += weight
    base = DomainProfile(
        tendency=tendency,
        pages=js.js_round(math.exp(r.range(math.log(400), math.log(9000)))),
        pdf_ratio=r.range(0.08, 0.32),
        alt_pdf_ratio=r.range(0.1, 0.25),
        dup_ratio=r.range(0.08, 0.4),
        upd_ratio=r.range(0.04, 0.12),
        reject_ratio=r.range(0.04, 0.16),
        reject_mix={reason: weight / total for reason, weight in zip(REJECT_REASONS, weights, strict=True)},
        flaky=r.range(0.05, 0.35),
    )
    known = KNOWN.get(domain)
    return base if known is None else replace(base, **known)


def _clamp01(x: float) -> float:
    return min(1, max(0, x))


def counters_at(profile: DomainProfile, mode: RunMode, p: float, entry_point_added: bool) -> Counters:
    if profile.tendency == "no_pdfs":
        pdf_ratio = profile.alt_pdf_ratio if entry_point_added else 0
    else:
        pdf_ratio = profile.pdf_ratio
    pdf_total = js.js_round(profile.pages * pdf_ratio)
    mapped = min(1, p / MAP_END)
    tail = _clamp01((p - MAP_END) / (DOWNLOAD_END - MAP_END))
    pages = js.js_round(profile.pages * (0.8 * mapped + 0.2 * tail))
    pdfs_found = js.js_round(pdf_total * (0.85 * mapped + 0.15 * tail))
    downloaded = min(pdfs_found, js.js_round(pdf_total * tail))
    processed = min(downloaded, js.js_round(pdf_total * _clamp01((p - PROCESS_START) / (1 - PROCESS_START))))
    rejected = js.js_round(processed * profile.reject_ratio)
    valid = processed - rejected
    dup_ratio = 0.55 + profile.dup_ratio if mode == "recrawl" else profile.dup_ratio
    duplicates = js.js_round(valid * dup_ratio)
    updated = min(valid - duplicates, js.js_round(valid * profile.upd_ratio)) if mode == "recrawl" else 0
    return Counters(
        pages=pages,
        pdfs_found=pdfs_found,
        downloaded=downloaded,
        processed=processed,
        published=valid - duplicates - updated,
        updated=updated,
        duplicates=duplicates,
        rejected=rejected,
        reject_reasons=_apportion(rejected, profile.reject_mix),
    )


def _apportion(total: int, mix: dict[RejectReason, float]) -> dict[RejectReason, int]:
    raw = [total * mix[reason] for reason in REJECT_REASONS]
    out = [math.floor(value) for value in raw]
    order = sorted(range(len(raw)), key=lambda i: raw[i] - math.floor(raw[i]), reverse=True)
    for j in range(total - sum(out)):
        out[order[j]] += 1
    return dict(zip(REJECT_REASONS, out, strict=True))


def empty_counters() -> Counters:
    return Counters(
        pages=0,
        pdfs_found=0,
        downloaded=0,
        processed=0,
        published=0,
        updated=0,
        duplicates=0,
        rejected=0,
        reject_reasons=dict.fromkeys(REJECT_REASONS, 0),
    )


def add_counters(into: Counters, c: Counters) -> Counters:
    into.pages += c.pages
    into.pdfs_found += c.pdfs_found
    into.downloaded += c.downloaded
    into.processed += c.processed
    into.published += c.published
    into.updated += c.updated
    into.duplicates += c.duplicates
    into.rejected += c.rejected
    for reason in REJECT_REASONS:
        into.reject_reasons[reason] += c.reject_reasons[reason]
    return into


def plan_attempt(
    *,
    domain: str,
    seed: int,
    attempt: int,
    start_p: float,
    settings: RunSettings,
    profile: DomainProfile,
    slowed: bool,
    previous: Blocker | None,
    remedy: Remedy | None,
    approved: bool,
) -> AttemptPlan:
    r = Rng(hash32("attempt", seed, domain, attempt, "-" if remedy is None else remedy))
    duration_sec = (min(900, max(90, 60 + math.sqrt(profile.pages) * 6)) / PACE_FACTOR[settings.pace]) * (
        1.7 if slowed else 1
    )

    blocker: Blocker | None
    if attempt == 1:
        blocker = None if profile.tendency == "robots" and not settings.respect_robots else profile.tendency
        if blocker is None and settings.pace == "aggressive" and r.chance(0.12):
            blocker = "waf"
    elif previous is None or approved:
        blocker = None
    else:
        success = REMEDY_SUCCESS[previous].get("retry" if remedy is None else remedy, 0)
        blocker = None if r.chance(success) else previous

    room = 1 - start_p
    fail_at: float | None = None
    if blocker is not None and attempt > 1:
        fail_at = start_p + 0.01 + r.next() * 0.12 * room
    elif blocker is not None:
        first_fail: dict[Blocker, float] = {
            "captcha": r.range(0.05, 0.5),
            "waf": r.range(0.1, 0.6),
            "robots": 0.02,
            "login": r.range(0.04, 0.14),
            "dns": 0.003,
            "tls": 0.004,
            "no_pdfs": MAP_END,
            "unstable": r.range(0.35, 0.7),
        }
        fail_at = first_fail[blocker]

    end = 1 if fail_at is None else fail_at
    if blocker == "unstable":
        episode_count = 2
    elif r.chance(profile.flaky * (1.8 if settings.pace == "aggressive" else 1)):
        episode_count = r.integer(1, 2)
    else:
        episode_count = 0
    episodes = [
        Episode(
            at=start_p + r.range(0.05, 0.95) * (end - start_p),
            dur_sec=r.range(12, 45) * (1.4 if slowed else 1),
            kind="rate_limited" if r.chance(0.6) else "timeout",
        )
        for _ in range(episode_count)
    ]
    return AttemptPlan(
        blocker=blocker,
        fail_at=fail_at,
        episodes=tuple(sorted(episodes, key=lambda e: e.at)),
        duration_sec=duration_sec,
    )
