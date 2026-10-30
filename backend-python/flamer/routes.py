import re
import uuid
from typing import Annotated, Final

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi import Path as PathParam
from fastapi.responses import HTMLResponse, StreamingResponse
from starlette.convertors import Convertor, register_url_convertor

from flamer import js
from flamer.aggregate import issues_of, overview_of, registry_of, simulate_all, summarize
from flamer.catalog import available_actions
from flamer.clock import Clock
from flamer.contract import (
    ActionInput,
    ApiError,
    BackendInfo,
    CreateRunInput,
    DemoInput,
    DemoState,
    DomainActionInput,
    Graph,
    InFlight,
    Issue,
    Overview,
    RegistryEntry,
    RunAction,
    RunDetail,
    RunRecord,
    RunSpec,
    RunSummary,
    ValidateInput,
    ValidationResult,
)
from flamer.domains import parse_domain_list
from flamer.errors import NO_STORE, HttpError
from flamer.exports import domains_csv, issues_csv
from flamer.graph import build_graph
from flamer.scope import ScopeDep, get_scope, no_store
from flamer.sim.engine import simulate_run
from flamer.sim.rng import hash32
from flamer.sse import live_events
from flamer.store.base import Store

FOCUS: Final = re.compile(r"(?:run|domain|blocker|country):[^\n\r\u2028\u2029]+")
API_PREFIX: Final = re.compile(r"^.*?/api/?")
ALL_METHODS: Final = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
DOCS_HTML: Final = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Flamer API</title>
  </head>
  <body>
    <script id="api-reference" data-url="./openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.74.0"></script>
  </body>
</html>
"""


class RunIdConvertor(Convertor[str]):
    regex = "[A-Za-z0-9_-]+"

    def convert(self, value: str) -> str:
        return value

    def to_string(self, value: str) -> str:
        return value


register_url_convertor("run_id", RunIdConvertor())


RunId = Annotated[str, PathParam(alias="runId")]
At = Annotated[
    str | None, Query(description="Replay: compute the state at this time (ms, demo clock). Defaults to now.")
]
ERRORS: Final[dict[int | str, dict[str, object]]] = {
    400: {"model": ApiError, "description": "Invalid input"},
    404: {"model": ApiError, "description": "Not found"},
    409: {"model": ApiError, "description": "Not possible in the current state"},
}

router = APIRouter(prefix="/api", dependencies=[Depends(no_store)], responses=ERRORS)


async def _load(store: Store, run_id: str) -> RunRecord:
    record = await store.get_run(run_id)
    if record is None:
        raise HttpError(404, f"Run {run_id} not found")
    return record


@router.get("/health", tags=["System"], summary="Runtime and storage in use", response_model=BackendInfo)
async def health(scope: ScopeDep) -> BackendInfo:
    return BackendInfo(
        runtime=scope.services.runtime, store=scope.store.kind, durable=scope.store.durable, now=scope.now()
    )


@router.get("/demo", tags=["Demo"], summary="Demo clock and sandbox", response_model=DemoState)
async def get_demo(scope: ScopeDep) -> DemoState:
    return scope.demo_state(scope.clock)


@router.post("/demo", tags=["Demo"], summary="Change the demo clock speed (1×, 10×, 60×)", response_model=DemoState)
async def set_demo(scope: ScopeDep, body: DemoInput) -> DemoState:
    clock = Clock(anchor_real=scope.services.real_now(), anchor_sim=scope.now(), speed=body.speed)
    await scope.store.set_clock(clock)
    return scope.demo_state(clock)


@router.post("/demo/reset", tags=["Demo"], summary="Wipe this sandbox and re-seed the demo data")
async def reset_demo(scope: ScopeDep) -> DemoState:
    seeder = scope.services.seeder
    await scope.store.reset()
    seeder.forget(scope.namespace)
    await seeder.ensure(scope.namespace, scope.store, scope.services.real_now())
    return scope.demo_state(None)


@router.get("/docs", include_in_schema=False)
async def docs() -> HTMLResponse:
    return HTMLResponse(DOCS_HTML)


@router.get(
    "/overview",
    tags=["Monitor"],
    summary="KPIs, throughput, runs, open issues, recent events",
    response_model=Overview,
    response_model_exclude_unset=True,
)
async def overview(scope: ScopeDep, at: At = None) -> Overview:
    t = scope.at(at)
    return overview_of(simulate_all(await scope.store.list_runs(), t), t)


@router.get(
    "/runs", tags=["Runs"], summary="Run summaries", response_model=list[RunSummary], response_model_exclude_unset=True
)
async def list_runs(scope: ScopeDep) -> list[RunSummary]:
    return [summarize(d) for d in simulate_all(await scope.store.list_runs(), scope.now())]


@router.post(
    "/runs",
    tags=["Runs"],
    summary="Start a crawl run",
    status_code=201,
    response_model=RunSummary,
    response_model_exclude_unset=True,
)
async def create_run(scope: ScopeDep, body: CreateRunInput) -> RunSummary:
    parsed = parse_domain_list("\n".join(body.domains))
    if not parsed.valid:
        raise HttpError(400, "No valid domains in the list", parsed.invalid)
    created_at = scope.now()
    spec = RunSpec(
        id=f"run_{js.to_base36(int(created_at))}{str(uuid.uuid4())[:6]}",
        name=body.name,
        mode=body.mode,
        settings=body.settings,
        domains=parsed.valid,
        created_at=created_at,
        created_by=body.actor,
        seed=hash32(created_at, body.name),
    )
    await scope.store.create_run(spec)
    return summarize(simulate_run(RunRecord(spec=spec, actions=[]), created_at))


@router.get(
    "/runs/{runId:run_id}",
    tags=["Runs"],
    summary="Full run state with every domain",
    response_model=RunDetail,
    response_model_exclude_unset=True,
)
async def get_run(scope: ScopeDep, run_id: RunId, at: At = None) -> RunDetail:
    return simulate_run(await _load(scope.store, run_id), scope.at(at))


@router.post(
    "/runs/{runId:run_id}/actions",
    tags=["Runs"],
    summary="Pause/resume/cancel a run, or act on domains (pause, resume, retry, resolve, skip, assign, note)",
    response_model=RunDetail,
    response_model_exclude_unset=True,
)
async def act(scope: ScopeDep, run_id: RunId, body: ActionInput) -> RunDetail:
    payload = body.root
    record = await _load(scope.store, run_id)
    at = scope.now()
    current = simulate_run(record, at)
    if current.status == "cancelled":
        raise HttpError(409, "This run was cancelled")
    action = RunAction(id=str(uuid.uuid4()), at=at, type=payload.type, actor=payload.actor)
    if payload.note is not None and js.trim(payload.note) != "":
        action.note = js.trim(payload.note)
    if isinstance(payload, DomainActionInput):
        if payload.type == "note" and action.note is None:
            raise HttpError(400, "A note needs some text")
        if payload.type == "assign" and "assignee" not in payload.model_fields_set:
            raise HttpError(400, "assign needs an assignee (or null to unassign)")
        snapshots = {d.domain: d for d in current.domains}
        remedy = "retry" if payload.remedy is None else payload.remedy
        rejected = [
            domain
            for domain in payload.domains
            if (snapshot := snapshots.get(domain)) is None
            or payload.type not in available_actions(snapshot.status)
            or (payload.type == "resolve" and remedy not in snapshot.remedies)
        ]
        if len(rejected) == len(payload.domains):
            raise HttpError(409, f"“{payload.type}” is not possible for {', '.join(rejected)} right now")
        action.domains = [d for d in payload.domains if d not in rejected]
        if payload.remedy is not None:
            action.remedy = payload.remedy
        if payload.type == "assign":
            action.assignee = payload.assignee
    elif payload.type == "pause_run" and current.paused:
        raise HttpError(409, "The run is already paused")
    elif payload.type == "resume_run" and not current.paused:
        raise HttpError(409, "The run is not paused")
    await scope.store.append_actions(run_id, [action])
    return simulate_run(RunRecord(spec=record.spec, actions=[*record.actions, action]), at)


@router.get(
    "/graph",
    tags=["Explore"],
    summary="Relationship graph of runs, domains, blockers and countries",
    response_model=Graph,
    response_model_exclude_unset=True,
)
async def graph(
    scope: ScopeDep,
    focus: Annotated[
        str | None,
        Query(description="run:<id> | domain:<name> | blocker:<code> | country:<ISO>; two-step neighbourhood"),
    ] = None,
    at: At = None,
) -> Graph:
    if focus is not None and FOCUS.fullmatch(focus) is None:
        raise HttpError(400, "focus must look like run:<id>, domain:<name>, blocker:<code> or country:<ISO>")
    t = scope.at(at)
    result = build_graph(simulate_all(await scope.store.list_runs(), t), focus, t)
    if result is None:
        raise HttpError(404, f"Nothing called {focus} in the data")
    return result


@router.get(
    "/issues",
    tags=["Monitor"],
    summary="Blocked domains across runs, oldest first",
    response_model=list[Issue],
    response_model_exclude_unset=True,
)
async def issues(scope: ScopeDep) -> list[Issue]:
    return issues_of(simulate_all(await scope.store.list_runs(), scope.now()))


@router.get(
    "/issues.csv",
    tags=["Export"],
    summary="Blocked domains as CSV",
    response_class=Response,
    responses={200: {"content": {"text/csv": {"schema": {"type": "string"}}}}},
)
async def issues_export(scope: ScopeDep) -> Response:
    rows = issues_of(simulate_all(await scope.store.list_runs(), scope.now()))
    return _csv("flamer-blocked-domains.csv", issues_csv(rows))


@router.get(
    "/domains",
    tags=["Monitor"],
    summary="Registry of every domain ever crawled",
    response_model=list[RegistryEntry],
    response_model_exclude_unset=True,
)
async def domains(scope: ScopeDep) -> list[RegistryEntry]:
    return registry_of(simulate_all(await scope.store.list_runs(), scope.now()))


@router.get(
    "/domains.csv",
    tags=["Export"],
    summary="Domain registry as CSV",
    response_class=Response,
    responses={200: {"content": {"text/csv": {"schema": {"type": "string"}}}}},
)
async def domains_export(scope: ScopeDep) -> Response:
    entries = registry_of(simulate_all(await scope.store.list_runs(), scope.now()))
    return _csv("flamer-domains.csv", domains_csv(entries))


@router.post(
    "/validate",
    tags=["Runs"],
    summary="Clean a pasted domain list and flag domains already in flight",
    response_model=ValidationResult,
    response_model_exclude_unset=True,
)
async def validate(scope: ScopeDep, body: ValidateInput) -> ValidationResult:
    parsed = parse_domain_list(body.text)
    in_flight: dict[str, str] = {}
    for run in simulate_all(await scope.store.list_runs(), scope.now()):
        if run.status not in ("completed", "cancelled"):
            for d in run.domains:
                if d.status not in ("completed", "skipped", "cancelled"):
                    in_flight[d.domain] = run.name
    return ValidationResult(
        valid=parsed.valid,
        duplicates=parsed.duplicates,
        invalid=parsed.invalid,
        in_flight=[InFlight(domain=d, run=in_flight[d]) for d in parsed.valid if d in in_flight],
    )


@router.get(
    "/stream",
    tags=["Monitor"],
    summary="Server-Sent Events: `pulse` (Pulse) every 2 s and `activity` (CrawlEvent[])",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {"schema": {"type": "string"}}}}},
)
async def stream(scope: ScopeDep) -> StreamingResponse:
    services = scope.services
    return StreamingResponse(
        live_events(scope.store, scope.clock, services.real_now, services.stream),
        headers={
            "content-type": "text/event-stream",
            "cache-control": "no-cache, no-transform",
            "x-accel-buffering": "no",
        },
    )


@router.api_route("", methods=ALL_METHODS, dependencies=[Depends(get_scope)], include_in_schema=False)
@router.api_route("/{path:path}", methods=ALL_METHODS, dependencies=[Depends(get_scope)], include_in_schema=False)
async def no_route(request: Request) -> Response:
    raw_path = request.scope.get("raw_path")
    path = raw_path.decode("latin-1") if isinstance(raw_path, bytes) else request.url.path
    raise HttpError(404, f"No route for {request.method} /api/{API_PREFIX.sub('', path, count=1).removesuffix('/')}")


def _csv(filename: str, body: str) -> Response:
    return Response(
        body,
        media_type="text/csv; charset=utf-8",
        headers={"content-disposition": f'attachment; filename="{filename}"', **NO_STORE},
    )
