from typing import Annotated, Final, Literal, get_args

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    PlainSerializer,
    RootModel,
    WithJsonSchema,
)
from pydantic.alias_generators import to_camel

from flamer import js

RunMode = Literal["backfill", "recrawl"]
Pace = Literal["gentle", "standard", "aggressive"]
Blocker = Literal["captcha", "waf", "robots", "login", "dns", "tls", "no_pdfs", "unstable"]
Remedy = Literal[
    "retry",
    "slow_down",
    "solved_session",
    "request_allowlist",
    "request_permission",
    "add_credentials",
    "allow_insecure",
    "add_entry_point",
]
DomainStatus = Literal[
    "queued",
    "discovering",
    "downloading",
    "processing",
    "backing_off",
    "waiting_owner",
    "needs_attention",
    "paused",
    "completed",
    "skipped",
    "cancelled",
]
RejectReason = Literal["not_pdf", "encrypted", "corrupted", "scanned", "too_large", "off_topic"]
RunActionType = Literal["pause_run", "resume_run", "cancel_run"]
DomainActionType = Literal["pause", "resume", "retry", "resolve", "skip", "assign", "note"]
ActionType = RunActionType | DomainActionType
DemoSpeed = Literal[1, 10, 60]
OrgType = Literal["intergovernmental", "think_tank", "ngo", "government", "academic", "unknown"]
RunStatus = Literal["running", "paused", "blocked", "completed", "cancelled"]
EventLevel = Literal["info", "success", "warn", "error", "action"]
GraphNodeKind = Literal["run", "domain", "blocker", "country"]
GraphEdgeKind = Literal["crawled", "blocked_by", "located_in"]
Tone = Literal["muted", "info", "warn", "danger", "success"]
GraphTone = Tone | Literal["brand"]
Runtime = Literal["edge", "service-worker", "node", "node-dev", "in-page", "python"]
StoreKind = Literal["memory", "upstash", "indexeddb", "postgres"]

DOMAIN_STATUSES: Final[tuple[DomainStatus, ...]] = get_args(DomainStatus)
REJECT_REASONS: Final[tuple[RejectReason, ...]] = get_args(RejectReason)
ACTION_TYPES: Final[tuple[ActionType, ...]] = (*get_args(RunActionType), *get_args(DomainActionType))
OWNER_REMEDIES: Final[tuple[Remedy, ...]] = ("request_allowlist", "request_permission")


def _js_number(value: float) -> int | float:
    return int(value) if value.is_integer() else value


def _number_only(value: object) -> object:
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise ValueError(f"Invalid input: expected number, received {type(value).__name__}")
    return value


def _not_null(value: object) -> object:
    if value is None:
        raise ValueError("Invalid input: expected a value, received null")
    return value


def _js_string(*, max_length: int, min_length: int = 0, trim: bool = False) -> AfterValidator:
    def check(value: str) -> str:
        text = js.trim(value) if trim else value
        size = js.utf16_length(text)
        if size < min_length:
            raise ValueError(f"Too small: expected string to have >={min_length} characters")
        if size > max_length:
            raise ValueError(f"Too big: expected string to have <={max_length} characters")
        return text

    return AfterValidator(check)


JsNumber = Annotated[
    float,
    PlainSerializer(_js_number, return_type=int | float, when_used="json"),
    WithJsonSchema({"type": "number"}),
]
Millis = Annotated[JsNumber, Field(description="Unix time in milliseconds (demo clock)")]
JsInt = Annotated[int, Field(strict=False), BeforeValidator(_number_only)]
Actor = Annotated[str, _js_string(min_length=1, max_length=40, trim=True), Field(json_schema_extra={"maxLength": 40})]
ActionNote = Annotated[str, _js_string(max_length=280), Field(json_schema_extra={"maxLength": 280})]
DomainList = Annotated[list[str], Field(min_length=1, max_length=500)]
StatusCounts = dict[DomainStatus, int]


class Model(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, serialize_by_alias=True)


class InputModel(Model):
    model_config = ConfigDict(strict=True)


class RunSettings(InputModel):
    concurrency: Annotated[JsInt, Field(ge=1, le=16)]
    pace: Pace
    respect_robots: bool
    recrawl_every_days: Annotated[
        Annotated[JsInt, Field(ge=0, le=365)] | None,
        BeforeValidator(_not_null),
        Field(description="0 or absent: no recurring recrawl"),
    ] = None


class CreateRunInput(InputModel):
    name: Annotated[str, _js_string(min_length=3, max_length=80, trim=True)]
    mode: RunMode
    settings: RunSettings
    domains: DomainList
    actor: Actor = "You"


class RunActionInput(InputModel):
    type: RunActionType
    note: Annotated[ActionNote | None, BeforeValidator(_not_null)] = None
    actor: Actor = "You"


class DomainActionInput(InputModel):
    type: DomainActionType
    domains: DomainList
    remedy: Annotated[Remedy | None, BeforeValidator(_not_null)] = None
    assignee: Annotated[Actor | None, Field(description="assign only: who owns the domain; null unassigns")] = None
    note: Annotated[ActionNote | None, BeforeValidator(_not_null)] = None
    actor: Actor = "You"


class ActionInput(RootModel[Annotated[RunActionInput | DomainActionInput, Field(discriminator="type")]]):
    pass


class ValidateInput(InputModel):
    text: Annotated[str, _js_string(max_length=200_000), Field(json_schema_extra={"maxLength": 200_000})]


class DemoInput(InputModel):
    speed: Annotated[DemoSpeed, BeforeValidator(_number_only)]


class InvalidDomain(Model):
    input: str
    reason: str


class InFlight(Model):
    domain: str
    run: str


class ParsedDomains(Model):
    valid: list[str]
    duplicates: list[str]
    invalid: list[InvalidDomain]


class ValidationResult(ParsedDomains):
    in_flight: list[InFlight]


class RunSpec(Model):
    id: str
    name: str
    mode: RunMode
    settings: RunSettings
    domains: list[str]
    created_at: Millis
    created_by: str
    seed: int


class RunAction(Model):
    id: str
    at: Millis
    type: ActionType
    actor: str
    domains: list[str] | None = None
    remedy: Remedy | None = None
    assignee: str | None = None
    note: str | None = None


class RunRecord(Model):
    spec: RunSpec
    actions: list[RunAction]


class Counters(Model):
    pages: int
    pdfs_found: int
    downloaded: int
    processed: int
    published: int
    updated: int
    duplicates: int
    rejected: int
    reject_reasons: dict[RejectReason, int]


class CrawlEvent(Model):
    at: Millis
    run_id: str
    run_name: str
    domain: str | None = None
    level: EventLevel
    message: str


class Note(Model):
    at: Millis
    actor: str
    text: str


class DomainSnapshot(Model):
    domain: str
    status: DomainStatus
    progress: JsNumber
    attempt: int
    blocker: Blocker | None
    blocked_since: Millis | None
    owner_declined: bool
    remedies: list[Remedy]
    resume_at: Millis | None
    started_at: Millis | None
    finished_at: Millis | None
    pages_per_min: int
    eta_sec: int | None
    counters: Counters
    last_event: CrawlEvent | None
    owner: str | None
    notes: list[Note]


class ThroughputPoint(Model):
    t: Millis
    pages: int
    published: int


class RunSummary(Model):
    id: str
    name: str
    mode: RunMode
    settings: RunSettings
    created_at: Millis
    created_by: str
    status: RunStatus
    paused: bool
    progress: JsNumber
    domain_count: int
    status_counts: StatusCounts
    attention: int
    counters: Counters
    pages_per_min: int
    eta_sec: int | None
    finished_at: Millis | None


class RunDetail(RunSummary):
    at: Millis
    domains: list[DomainSnapshot]
    events: list[CrawlEvent]
    throughput: list[ThroughputPoint]
    actions: list[RunAction]


class Issue(Model):
    run_id: str
    run_name: str
    domain: str
    blocker: Blocker
    since: Millis
    attempt: int
    remedies: list[Remedy]
    owner_declined: bool
    progress: JsNumber
    owner: str | None
    notes: int


class Overview(Model):
    at: Millis
    totals: Counters
    status_counts: StatusCounts
    active_runs: int
    pages_per_min: int
    attention: int
    throughput: list[ThroughputPoint]
    runs: list[RunSummary]
    issues: list[Issue]
    events: list[CrawlEvent]


class GeoPlace(Model):
    city: str | None
    country: str = Field(description="ISO 3166-1 alpha-2")
    country_name: str
    iso: str = Field(description="ISO 3166-1 numeric, as used by world-atlas")
    lat: JsNumber
    lon: JsNumber


class OrgInfo(Model):
    name: str | None
    type: OrgType
    place: GeoPlace | None


class RegistryEntry(Model):
    domain: str
    org: OrgInfo
    run_ids: list[str]
    runs: int
    last_run_id: str
    last_run_name: str
    last_status: DomainStatus
    last_seen: Millis
    published: int
    duplicates: int
    rejected: int
    blockers: list[Blocker]
    recrawl_every_days: int | None
    next_recrawl_at: Millis | None


class GraphNode(Model):
    id: str
    kind: GraphNodeKind
    label: str
    sub: str
    tone: GraphTone
    weight: JsNumber
    depth: int | None


class GraphEdge(Model):
    source: str
    target: str
    kind: GraphEdgeKind
    tone: GraphTone


class Graph(Model):
    at: Millis
    focus: str | None
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    hidden: int


class BackendInfo(Model):
    runtime: Runtime
    store: StoreKind
    durable: bool
    now: Millis


class DemoState(Model):
    speed: DemoSpeed
    now: Millis = Field(description="Current demo-clock time")
    real_now: Millis
    sandbox: str | None = Field(description="Visitor sandbox id, or null when everyone shares one dataset")


class PulseRun(Model):
    id: str
    status: RunStatus
    progress: JsNumber
    attention: int


class Pulse(Model):
    now: Millis
    active_runs: int
    attention: int
    pages_per_min: int
    runs: list[PulseRun]


class IssueTree(Model):
    errors: list[str]
    properties: dict[str, "IssueTree"] | None = None
    items: list["IssueTree | None"] | None = None


class ApiError(Model):
    error: str
    issues: IssueTree | list[InvalidDomain] | None = None
