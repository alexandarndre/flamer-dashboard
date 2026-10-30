import math
from dataclasses import dataclass, field
from typing import Final

from flamer import js
from flamer.catalog import ACTIVE_STATUSES, BLOCKER_INFO, REMEDY_LABEL, TERMINAL_STATUSES, available_actions
from flamer.contract import (
    DOMAIN_STATUSES,
    OWNER_REMEDIES,
    Blocker,
    CrawlEvent,
    DomainSnapshot,
    DomainStatus,
    EventLevel,
    Note,
    Remedy,
    RunAction,
    RunDetail,
    RunMode,
    RunRecord,
    RunStatus,
    StatusCounts,
    ThroughputPoint,
)
from flamer.sim.profile import (
    DOWNLOAD_END,
    MAP_END,
    OWNER_APPROVAL,
    AttemptPlan,
    DomainProfile,
    add_counters,
    counters_at,
    empty_counters,
    plan_attempt,
    profile_of,
)
from flamer.sim.rng import Rng, hash32

WINDOW_MIN: Final = 60
MINUTE: Final = 60_000
EPS: Final = 1e-9
MAX_STEPS: Final = 200_000


@dataclass(slots=True)
class DomainState:
    domain: str
    profile: DomainProfile
    plan: AttemptPlan
    queue_seq: int
    status: DomainStatus = "queued"
    p: float = 0
    attempt: int = 1
    episode_idx: int = 0
    resume_at: float | None = None
    blocker: Blocker | None = None
    last_blocker: Blocker | None = None
    blocked_since: float | None = None
    owner_declined: bool = False
    owner_approves: bool = False
    slowed: bool = False
    entry_point_added: bool = False
    held_by_run: bool = False
    started_at: float | None = None
    finished_at: float | None = None
    last_event: CrawlEvent | None = None
    owner: str | None = None
    notes: list[Note] = field(default_factory=list)


def is_active(status: DomainStatus) -> bool:
    return status in ACTIVE_STATUSES


def is_terminal(status: DomainStatus) -> bool:
    return status in TERMINAL_STATUSES


def stage_of(p: float) -> DomainStatus:
    return "discovering" if p < MAP_END else "downloading" if p < DOWNLOAD_END else "processing"


def fmt(n: int) -> str:
    return f"{n:,}"


def empty_status_counts() -> StatusCounts:
    return dict.fromkeys(DOMAIN_STATUSES, 0)


def remedies_for(blocker: Blocker | None, owner_declined: bool) -> list[Remedy]:
    if blocker is None:
        return []
    remedies = BLOCKER_INFO[blocker].remedies
    return [r for r in remedies if r not in OWNER_REMEDIES] if owner_declined else list(remedies)


class _Simulation:
    def __init__(self, record: RunRecord, at: float) -> None:
        self.record = record
        self.spec = record.spec
        self.at = at
        self.events: list[CrawlEvent] = []
        self.buckets: dict[int, ThroughputPoint] = {}
        self.window_start = math.floor(at / MINUTE) * MINUTE - (WINDOW_MIN - 1) * MINUTE
        self.seq = 0
        self.run_paused = False
        self.cancelled_at: float | None = None
        self.states = [self._initial_state(domain) for domain in self.spec.domains]
        self.by_domain = {state.domain: state for state in self.states}

    def _initial_state(self, domain: str) -> DomainState:
        profile = profile_of(domain)
        plan = plan_attempt(
            domain=domain,
            seed=self.spec.seed,
            attempt=1,
            start_p=0,
            settings=self.spec.settings,
            profile=profile,
            slowed=False,
            previous=None,
            remedy=None,
            approved=False,
        )
        return DomainState(domain=domain, profile=profile, plan=plan, queue_seq=self._next_seq())

    def _next_seq(self) -> int:
        self.seq += 1
        return self.seq - 1

    def emit(self, t: float, level: EventLevel, message: str, ds: DomainState | None = None) -> None:
        if ds is None:
            event = CrawlEvent(at=t, run_id=self.spec.id, run_name=self.spec.name, level=level, message=message)
        else:
            event = CrawlEvent(
                at=t, run_id=self.spec.id, run_name=self.spec.name, level=level, message=message, domain=ds.domain
            )
            ds.last_event = event
        self.events.append(event)

    def requeue(self, ds: DomainState, remedy: Remedy | None, *, approved: bool) -> None:
        ds.attempt += 1
        if remedy == "slow_down":
            ds.slowed = True
        if remedy == "add_entry_point":
            ds.entry_point_added = True
            ds.p = min(ds.p, 0.12)
        ds.plan = plan_attempt(
            domain=ds.domain,
            seed=self.spec.seed,
            attempt=ds.attempt,
            start_p=ds.p,
            settings=self.spec.settings,
            profile=ds.profile,
            slowed=ds.slowed,
            previous=ds.last_blocker,
            remedy=remedy,
            approved=approved,
        )
        ds.episode_idx = 0
        ds.blocker = None
        ds.blocked_since = None
        ds.resume_at = None
        ds.finished_at = None
        ds.status = "queued"
        ds.queue_seq = self._next_seq()

    def fill_slots(self, t: float) -> None:
        if self.run_paused or self.cancelled_at is not None:
            return
        free = self.spec.settings.concurrency - sum(1 for s in self.states if is_active(s.status))
        if free <= 0:
            return
        queue = sorted((s for s in self.states if s.status == "queued"), key=lambda s: s.queue_seq)
        for ds in queue:
            if free <= 0:
                break
            free -= 1
            ds.status = stage_of(ds.p)
            if ds.started_at is None:
                ds.started_at = t
            first = ds.attempt == 1 and ds.p == 0
            self.emit(
                t, "info", "Started mapping the site" if first else f"Resumed crawling (attempt {ds.attempt})", ds
            )

    @staticmethod
    def next_milestone(ds: DomainState) -> float:
        targets = [1.0]
        if ds.plan.fail_at is not None:
            targets.append(ds.plan.fail_at)
        if ds.episode_idx < len(ds.plan.episodes):
            targets.append(ds.plan.episodes[ds.episode_idx].at)
        if ds.p < MAP_END:
            targets.append(MAP_END)
        elif ds.p < DOWNLOAD_END:
            targets.append(DOWNLOAD_END)
        ahead = [x for x in targets if x > ds.p + EPS]
        return min(ahead) if ahead else ds.p

    def record_throughput(self, ds: DomainState, p0: float, p1: float, t0: float, t1: float) -> None:
        if t1 <= self.window_start:
            return
        a = max(t0, self.window_start)
        pa = p0 + ((p1 - p0) * (a - t0)) / (t1 - t0)
        ca = counters_at(ds.profile, self.spec.mode, pa, ds.entry_point_added)
        while a < t1:
            bucket = math.floor(a / MINUTE) * MINUTE
            b = min(t1, bucket + MINUTE)
            pb = p0 + ((p1 - p0) * (b - t0)) / (t1 - t0)
            cb = counters_at(ds.profile, self.spec.mode, pb, ds.entry_point_added)
            point = self.buckets.get(bucket)
            if point is None:
                point = ThroughputPoint(t=bucket, pages=0, published=0)
                self.buckets[bucket] = point
            point.pages += cb.pages - ca.pages + (cb.downloaded - ca.downloaded)
            point.published += cb.published + cb.updated - (ca.published + ca.updated)
            a = b
            ca = cb

    def advance(self, t0: float, t1: float) -> None:
        if t1 <= t0:
            return
        for ds in self.states:
            if not is_active(ds.status) or ds.status == "backing_off":
                continue
            p0 = ds.p
            p1 = min(self.next_milestone(ds), p0 + (t1 - t0) / 1000 / ds.plan.duration_sec)
            ds.p = p1
            self.record_throughput(ds, p0, p1, t0, t1)

    def settle(self, t: float) -> None:
        for ds in self.states:
            if ds.status == "backing_off" and ds.resume_at is not None and ds.resume_at <= t + EPS:
                ds.status = stage_of(ds.p)
                ds.resume_at = None
                self.emit(t, "info", "Site is responding again, continuing", ds)
                continue
            if ds.status == "waiting_owner" and ds.resume_at is not None and ds.resume_at <= t + EPS:
                if ds.owner_approves:
                    self.emit(t, "success", "Publisher approved our request, queued again", ds)
                    self.requeue(ds, None, approved=True)
                else:
                    ds.status = "needs_attention"
                    ds.owner_declined = True
                    ds.blocker = ds.last_blocker
                    ds.blocked_since = t
                    ds.resume_at = None
                    self.emit(t, "error", "Publisher declined our request", ds)
                continue
            if not is_active(ds.status) or ds.status == "backing_off":
                continue
            plan = ds.plan
            if plan.fail_at is not None and plan.blocker is not None and ds.p >= plan.fail_at - EPS:
                ds.status = "needs_attention"
                ds.blocker = plan.blocker
                ds.last_blocker = plan.blocker
                ds.blocked_since = t
                self.emit(t, "error", f"Blocked: {BLOCKER_INFO[plan.blocker].title}", ds)
                continue
            if ds.episode_idx < len(plan.episodes) and ds.p >= plan.episodes[ds.episode_idx].at - EPS:
                episode = plan.episodes[ds.episode_idx]
                ds.episode_idx += 1
                ds.status = "backing_off"
                ds.resume_at = t + episode.dur_sec * 1000
                what = (
                    "Site is rate-limiting us (HTTP 429)"
                    if episode.kind == "rate_limited"
                    else "Requests are timing out"
                )
                self.emit(t, "warn", f"{what}, retrying automatically in {js.js_round(episode.dur_sec)}s", ds)
                continue
            if ds.p >= 1 - EPS:
                ds.p = 1
                ds.status = "completed"
                ds.finished_at = t
                c = counters_at(ds.profile, self.spec.mode, 1, ds.entry_point_added)
                if self.spec.mode == "recrawl":
                    message = (
                        f"Done: {fmt(c.published)} new and {fmt(c.updated)} updated documents, "
                        f"{fmt(c.duplicates)} unchanged"
                    )
                else:
                    message = f"Done: {fmt(c.published)} documents published, {fmt(c.duplicates)} duplicates skipped"
                self.emit(t, "success", message, ds)
                continue
            stage = stage_of(ds.p)
            if stage != ds.status:
                c = counters_at(ds.profile, self.spec.mode, ds.p, ds.entry_point_added)
                if stage == "downloading":
                    message = f"Site mapped: {fmt(c.pages)} pages, {fmt(c.pdfs_found)} PDFs found"
                else:
                    message = f"All {fmt(c.downloaded)} PDFs downloaded, finishing processing"
                self.emit(t, "info", message, ds)
                ds.status = stage

    def apply(self, action: RunAction, t: float) -> None:
        who = action.actor
        note = "" if action.note is None else f" (“{action.note}”)"
        if action.type == "pause_run" and self.cancelled_at is None and not self.run_paused:
            self.run_paused = True
            for ds in self.states:
                if is_active(ds.status):
                    ds.status = "paused"
                    ds.held_by_run = True
                    ds.resume_at = None
            self.emit(t, "action", f"{who} paused the run{note}")
            return
        if action.type == "resume_run" and self.run_paused:
            self.run_paused = False
            for ds in self.states:
                if ds.held_by_run:
                    ds.status = stage_of(ds.p)
                    ds.held_by_run = False
            self.emit(t, "action", f"{who} resumed the run{note}")
            return
        if action.type == "cancel_run" and self.cancelled_at is None:
            self.cancelled_at = t
            self.run_paused = False
            for ds in self.states:
                if not is_terminal(ds.status):
                    ds.status = "cancelled"
                    ds.finished_at = t
                    ds.held_by_run = False
            self.emit(t, "action", f"{who} cancelled the run{note}")
            return
        if self.cancelled_at is not None:
            return
        for domain in action.domains or []:
            target = self.by_domain.get(domain)
            if target is not None and action.type in available_actions(target.status):
                self.apply_to_domain(action, target, t, who, note)

    def apply_to_domain(self, action: RunAction, ds: DomainState, t: float, who: str, note: str) -> None:
        match action.type:
            case "pause":
                ds.status = "paused"
                ds.held_by_run = False
                ds.resume_at = None
                self.emit(t, "action", f"{who} paused this domain{note}", ds)
            case "resume":
                ds.status = "queued"
                ds.queue_seq = self._next_seq()
                self.emit(t, "action", f"{who} resumed this domain{note}", ds)
            case "skip":
                ds.status = "skipped"
                ds.finished_at = t
                ds.resume_at = None
                self.emit(t, "action", f"{who} skipped this domain{note}", ds)
            case "retry":
                self.emit(t, "action", f"{who} asked for a retry{note}", ds)
                self.requeue(ds, "retry", approved=False)
            case "assign":
                ds.owner = action.assignee
                if ds.owner is None:
                    message = f"{who} unassigned this domain"
                elif ds.owner == who:
                    message = f"{who} took ownership"
                else:
                    message = f"{who} assigned this to {ds.owner}"
                self.emit(t, "action", message, ds)
            case "note":
                if action.note is None or js.trim(action.note) == "":
                    return
                ds.notes.append(Note(at=t, actor=who, text=action.note))
                self.emit(t, "action", f"{who} added a note: “{action.note}”", ds)
            case "resolve":
                remedy: Remedy = "retry" if action.remedy is None else action.remedy
                if ds.status != "needs_attention" or remedy not in remedies_for(ds.blocker, ds.owner_declined):
                    return
                if remedy in OWNER_REMEDIES:
                    r = Rng(hash32("owner", self.spec.seed, ds.domain, ds.attempt))
                    ds.status = "waiting_owner"
                    ds.owner_approves = r.chance(OWNER_APPROVAL.get(remedy, 0))
                    ds.resume_at = t + r.range(90, 240) * 1000
                    ds.blocker = None
                    self.emit(t, "action", f"{who} contacted the publisher{note}", ds)
                else:
                    self.emit(t, "action", f"{who} chose “{REMEDY_LABEL[remedy]}”{note}", ds)
                    self.requeue(ds, remedy, approved=False)
            case _:
                return

    def run(self) -> RunDetail:
        actions = sorted((a for a in self.record.actions if a.at <= self.at), key=lambda a: a.at)
        self.emit(
            self.spec.created_at,
            "action",
            f"{self.spec.created_by} started “{self.spec.name}” with {len(self.spec.domains)} domains",
        )
        t = self.spec.created_at
        ai = 0
        for _ in range(MAX_STEPS):
            self.fill_slots(t)
            t_next = self.at
            if ai < len(actions):
                t_next = min(t_next, actions[ai].at)
            for ds in self.states:
                if ds.status in ("backing_off", "waiting_owner") and ds.resume_at is not None:
                    t_next = min(t_next, ds.resume_at)
                elif is_active(ds.status):
                    t_next = min(t_next, t + (self.next_milestone(ds) - ds.p) * ds.plan.duration_sec * 1000)
            t_next = max(t, t_next)
            self.advance(t, t_next)
            t = t_next
            self.settle(t)
            while ai < len(actions) and actions[ai].at <= t:
                self.apply(actions[ai], t)
                ai += 1
            if t >= self.at and ai >= len(actions):
                self.settle(t)
                self.fill_slots(t)
                break
        return self.finish()

    def finish(self) -> RunDetail:
        spec = self.spec
        status_counts = empty_status_counts()
        counters = empty_counters()
        pages_per_min = 0.0
        remaining_sec = 0.0
        max_active_remaining = 0.0
        domains: list[DomainSnapshot] = []
        for ds in self.states:
            status_counts[ds.status] += 1
            c = counters_at(ds.profile, spec.mode, ds.p, ds.entry_point_added)
            add_counters(counters, c)
            running = is_active(ds.status) and ds.status != "backing_off"
            rate = _rate_per_min(ds, spec.mode) if running else 0
            pages_per_min += rate
            remaining = (1 - ds.p) * ds.plan.duration_sec
            if is_active(ds.status) or ds.status == "queued":
                remaining_sec += remaining
            if is_active(ds.status):
                max_active_remaining = max(max_active_remaining, remaining)
            attention = ds.status == "needs_attention"
            domains.append(
                DomainSnapshot(
                    domain=ds.domain,
                    status=ds.status,
                    progress=1 if ds.status == "completed" else ds.p,
                    attempt=ds.attempt,
                    blocker=ds.blocker if attention else None,
                    blocked_since=ds.blocked_since if attention else None,
                    owner_declined=ds.owner_declined,
                    remedies=remedies_for(ds.blocker, ds.owner_declined) if attention else [],
                    resume_at=ds.resume_at,
                    started_at=ds.started_at,
                    finished_at=ds.finished_at,
                    pages_per_min=js.js_round(rate),
                    eta_sec=js.js_round(remaining) if is_active(ds.status) else None,
                    counters=c,
                    last_event=ds.last_event,
                    owner=ds.owner,
                    notes=ds.notes,
                )
            )

        status = self.run_status(status_counts)
        finished_at: float | None = None
        if status == "cancelled":
            finished_at = self.cancelled_at
        elif status == "completed":
            finished_at = max((0 if s.finished_at is None else s.finished_at for s in self.states), default=-math.inf)

        throughput: list[ThroughputPoint] = []
        b = max(self.window_start, math.floor(spec.created_at / MINUTE) * MINUTE)
        while b <= self.at:
            point = self.buckets.get(b)
            throughput.append(ThroughputPoint(t=b, pages=0, published=0) if point is None else point)
            b += MINUTE

        progress = 0.0
        for d in domains:
            progress += 1 if d.status == "skipped" else d.progress

        return RunDetail(
            id=spec.id,
            name=spec.name,
            mode=spec.mode,
            settings=spec.settings,
            created_at=spec.created_at,
            created_by=spec.created_by,
            status=status,
            paused=self.run_paused,
            progress=progress / max(1, len(domains)),
            domain_count=len(domains),
            status_counts=status_counts,
            attention=status_counts["needs_attention"],
            counters=counters,
            pages_per_min=js.js_round(pages_per_min),
            eta_sec=(
                js.js_round(max(max_active_remaining, remaining_sec / spec.settings.concurrency))
                if status == "running" and remaining_sec > 0
                else None
            ),
            finished_at=finished_at,
            at=self.at,
            domains=domains,
            events=[e for e in self.events if e.at <= self.at],
            throughput=throughput,
            actions=[a for a in self.record.actions if a.at <= self.at],
        )

    def run_status(self, counts: StatusCounts) -> RunStatus:
        in_motion = counts["queued"] + counts["waiting_owner"] + sum(counts[s] for s in ACTIVE_STATUSES)
        if self.cancelled_at is not None:
            return "cancelled"
        if self.run_paused:
            return "paused"
        if in_motion > 0:
            return "running"
        if counts["needs_attention"] > 0:
            return "blocked"
        if counts["paused"] > 0:
            return "paused"
        return "completed"


def _rate_per_min(ds: DomainState, mode: RunMode) -> float:
    dp = 0.002
    a = counters_at(ds.profile, mode, ds.p, ds.entry_point_added)
    b = counters_at(ds.profile, mode, min(1, ds.p + dp), ds.entry_point_added)
    fetched = b.pages - a.pages + (b.downloaded - a.downloaded)
    return (fetched / (dp * ds.plan.duration_sec)) * 60


def simulate_run(record: RunRecord, at: float) -> RunDetail:
    return _Simulation(record, at).run()
