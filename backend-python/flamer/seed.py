from collections.abc import Callable
from typing import Final

from flamer.contract import DomainSnapshot, RunAction, RunMode, RunRecord, RunSettings, RunSpec
from flamer.sim.engine import simulate_run

MIN: Final = 60_000

IGO: Final = [
    "worldbank.org",
    "imf.org",
    "oecd.org",
    "who.int",
    "unesco.org",
    "undp.org",
    "unicef.org",
    "ilo.org",
    "fao.org",
    "wto.org",
    "unhcr.org",
    "iaea.org",
    "wipo.int",
    "adb.org",
    "afdb.org",
    "iadb.org",
    "ebrd.com",
    "ecb.europa.eu",
    "bis.org",
    "unep.org",
]
THINK_TANKS: Final = [
    "brookings.edu",
    "rand.org",
    "chathamhouse.org",
    "carnegieendowment.org",
    "csis.org",
    "cfr.org",
    "urban.org",
    "pewresearch.org",
    "odi.org",
    "iied.org",
    "wri.org",
    "ifpri.org",
    "cgdev.org",
    "piie.com",
    "bruegel.org",
    "sipri.org",
]
HEALTH: Final = [
    "msf.org",
    "path.org",
    "gavi.org",
    "theglobalfund.org",
    "ippf.org",
    "icrc.org",
    "ifrc.org",
    "savethechildren.net",
    "oxfam.org",
    "care.org",
    "plan-international.org",
    "wateraid.org",
]
STATS: Final = ["ons.gov.uk", "census.gov", "abs.gov.au", "statcan.gc.ca", "destatis.de", "insee.fr"]


def _spec(
    run_id: str,
    name: str,
    created_at: float,
    domains: list[str],
    settings: RunSettings,
    *,
    mode: RunMode = "backfill",
    created_by: str = "Maya R.",
) -> RunSpec:
    return RunSpec(
        id=run_id,
        name=name,
        mode=mode,
        settings=settings,
        domains=domains,
        created_at=created_at,
        created_by=created_by,
        seed=len(domains) * 7919 + len(run_id),
    )


def _blocked_at(record: RunRecord, at: float) -> list[DomainSnapshot]:
    return [
        d for d in simulate_run(record, at).domains if d.status == "needs_attention" and d.blocked_since is not None
    ]


def _first(domains: list[DomainSnapshot], match: Callable[[DomainSnapshot], bool]) -> DomainSnapshot | None:
    return next((d for d in domains if match(d)), None)


def seed_records(now: float) -> list[RunRecord]:
    igo = RunRecord(
        spec=_spec(
            "run_igo_weekly",
            "Intergovernmental orgs · weekly recrawl",
            now - 21 * MIN,
            IGO,
            RunSettings(concurrency=5, pace="standard", respect_robots=True, recrawl_every_days=7),
            mode="recrawl",
        ),
        actions=[],
    )
    captcha = _first(_blocked_at(igo, now - 4 * MIN), lambda d: d.blocker == "captcha")
    if captcha is not None and captcha.blocked_since is not None and captcha.blocked_since + 3 * MIN < now:
        igo.actions.append(
            RunAction(
                id=f"{igo.spec.id}_seed_1",
                at=captcha.blocked_since + 3 * MIN,
                type="resolve",
                remedy="solved_session",
                domains=[captcha.domain],
                actor="Maya R.",
            )
        )

    tanks = RunRecord(
        spec=_spec(
            "run_think_tanks_b3",
            "Think tanks · backfill batch 3",
            now - 190 * MIN,
            THINK_TANKS,
            RunSettings(concurrency=8, pace="standard", respect_robots=True, recrawl_every_days=30),
            created_by="Daniel K.",
        ),
        actions=[],
    )
    tank_blocks = _blocked_at(tanks, tanks.spec.created_at + 70 * MIN)
    waf = _first(tank_blocks, lambda d: d.blocker == "waf")
    if waf is not None and waf.blocked_since is not None:
        tanks.actions.append(
            RunAction(
                id=f"{tanks.spec.id}_seed_1",
                at=waf.blocked_since + 6 * MIN,
                type="skip",
                domains=[waf.domain],
                note="Members-only library, out of scope",
                actor="Daniel K.",
            )
        )
    tls = _first(tank_blocks, lambda d: d.blocker == "tls")
    if tls is not None and tls.blocked_since is not None:
        tanks.actions.append(
            RunAction(
                id=f"{tanks.spec.id}_seed_2",
                at=tls.blocked_since + 9 * MIN,
                type="resolve",
                remedy="allow_insecure",
                domains=[tls.domain],
                actor="Daniel K.",
            )
        )

    health = RunRecord(
        spec=_spec(
            "run_health_ngos",
            "Health NGOs · new sources",
            now - 4 * MIN,
            HEALTH,
            RunSettings(concurrency=4, pace="gentle", respect_robots=True),
        ),
        actions=[],
    )

    stats_start = now - 26 * 60 * MIN
    stats = RunRecord(
        spec=_spec(
            "run_stats_pilot",
            "National statistics offices · pilot",
            stats_start,
            STATS,
            RunSettings(concurrency=3, pace="aggressive", respect_robots=True, recrawl_every_days=1),
            created_by="Daniel K.",
        ),
        actions=[
            RunAction(
                id="run_stats_pilot_seed_1",
                at=stats_start + 18 * MIN,
                type="cancel_run",
                actor="Daniel K.",
                note="Pilot scope changed, will rerun with gentle pace",
            )
        ],
    )

    return [stats, tanks, igo, health]
