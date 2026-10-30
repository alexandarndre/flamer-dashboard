from typing import Final

from flamer.contract import (
    DOMAIN_STATUSES,
    Issue,
    Overview,
    Pulse,
    PulseRun,
    RegistryEntry,
    RunDetail,
    RunRecord,
    RunSummary,
    ThroughputPoint,
)
from flamer.geo import org_of
from flamer.sim.engine import empty_status_counts, simulate_run
from flamer.sim.profile import add_counters, empty_counters

DAY: Final = 86_400_000
RECENT_EVENTS: Final = 80


def summarize(d: RunDetail) -> RunSummary:
    return RunSummary(
        id=d.id,
        name=d.name,
        mode=d.mode,
        settings=d.settings,
        created_at=d.created_at,
        created_by=d.created_by,
        status=d.status,
        paused=d.paused,
        progress=d.progress,
        domain_count=d.domain_count,
        status_counts=d.status_counts,
        attention=d.attention,
        counters=d.counters,
        pages_per_min=d.pages_per_min,
        eta_sec=d.eta_sec,
        finished_at=d.finished_at,
    )


def simulate_all(records: list[RunRecord], at: float) -> list[RunDetail]:
    details = [simulate_run(r, at) for r in records if r.spec.created_at <= at]
    return sorted(details, key=lambda d: d.created_at, reverse=True)


def issues_of(details: list[RunDetail]) -> list[Issue]:
    issues = [
        Issue(
            run_id=run.id,
            run_name=run.name,
            domain=d.domain,
            blocker=d.blocker,
            since=run.at if d.blocked_since is None else d.blocked_since,
            attempt=d.attempt,
            remedies=d.remedies,
            owner_declined=d.owner_declined,
            progress=d.progress,
            owner=d.owner,
            notes=len(d.notes),
        )
        for run in details
        for d in run.domains
        if d.status == "needs_attention" and d.blocker is not None
    ]
    return sorted(issues, key=lambda i: i.since)


def overview_of(details: list[RunDetail], at: float) -> Overview:
    totals = empty_counters()
    status_counts = empty_status_counts()
    throughput: dict[float, ThroughputPoint] = {}
    for run in details:
        add_counters(totals, run.counters)
        for s in DOMAIN_STATUSES:
            status_counts[s] += run.status_counts[s]
        for point in run.throughput:
            into = throughput.get(point.t)
            if into is None:
                into = throughput[point.t] = ThroughputPoint(t=point.t, pages=0, published=0)
            into.pages += point.pages
            into.published += point.published
    events = sorted((e for run in details for e in run.events), key=lambda e: e.at, reverse=True)
    return Overview(
        at=at,
        totals=totals,
        status_counts=status_counts,
        active_runs=sum(1 for r in details if r.status in ("running", "paused")),
        pages_per_min=sum(r.pages_per_min for r in details),
        attention=status_counts["needs_attention"],
        throughput=sorted(throughput.values(), key=lambda p: p.t),
        runs=[summarize(d) for d in details],
        issues=issues_of(details),
        events=events[:RECENT_EVENTS],
    )


def pulse_of(overview: Overview) -> Pulse:
    return Pulse(
        now=overview.at,
        active_runs=overview.active_runs,
        attention=overview.attention,
        pages_per_min=overview.pages_per_min,
        runs=[PulseRun(id=r.id, status=r.status, progress=r.progress, attention=r.attention) for r in overview.runs],
    )


def registry_of(details: list[RunDetail]) -> list[RegistryEntry]:
    entries: dict[str, RegistryEntry] = {}
    for run in sorted(details, key=lambda d: d.created_at):
        for d in run.domains:
            entry = entries.get(d.domain)
            if entry is None:
                entry = entries[d.domain] = RegistryEntry(
                    domain=d.domain,
                    org=org_of(d.domain),
                    run_ids=[],
                    runs=0,
                    last_run_id=run.id,
                    last_run_name=run.name,
                    last_status=d.status,
                    last_seen=run.created_at,
                    published=0,
                    duplicates=0,
                    rejected=0,
                    blockers=[],
                    recrawl_every_days=None,
                    next_recrawl_at=None,
                )
            entry.runs += 1
            entry.run_ids.append(run.id)
            entry.last_run_id = run.id
            entry.last_run_name = run.name
            entry.last_status = d.status
            if d.finished_at is not None:
                entry.last_seen = d.finished_at
            elif d.last_event is not None:
                entry.last_seen = d.last_event.at
            else:
                entry.last_seen = run.created_at
            entry.published += d.counters.published + d.counters.updated
            entry.duplicates += d.counters.duplicates
            entry.rejected += d.counters.rejected
            if d.blocker is not None and d.blocker not in entry.blockers:
                entry.blockers.append(d.blocker)
            every = run.settings.recrawl_every_days or 0
            entry.recrawl_every_days = every if every > 0 else None
            entry.next_recrawl_at = (
                d.finished_at + every * DAY
                if every > 0 and d.status == "completed" and d.finished_at is not None
                else None
            )
    return sorted(entries.values(), key=lambda e: e.last_seen, reverse=True)
