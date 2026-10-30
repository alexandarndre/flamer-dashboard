import pytest
from httpx import AsyncClient, Response
from pydantic import TypeAdapter

from flamer.contract import ApiError, DemoState, Graph, Issue, Overview, RunDetail, RunSummary, ValidationResult
from tests.conftest import FakeClock

pytestmark = pytest.mark.anyio

SANDBOX = {"x-flamer-sandbox": "visitor0000001"}
RUNS = TypeAdapter(list[RunSummary])
ISSUES = TypeAdapter(list[Issue])


def _new_run(name: str, domains: list[str], concurrency: int = 2) -> dict[str, object]:
    return {
        "name": name,
        "mode": "backfill",
        "settings": {"concurrency": concurrency, "pace": "gentle", "respectRobots": True},
        "domains": domains,
    }


def _error(response: Response) -> ApiError:
    assert response.headers["content-type"] == "application/json"
    return ApiError.model_validate_json(response.content)


async def test_serves_seeded_data_on_first_request(client: AsyncClient) -> None:
    response = await client.get("/api/overview")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert len(Overview.model_validate_json(response.content).runs) == 4


async def test_reports_runtime_and_store(client: AsyncClient, clock: FakeClock) -> None:
    health = (await client.get("/api/health")).json()
    assert health["runtime"] == "python"
    assert health["store"] in ("memory", "postgres")
    assert health["durable"] is (health["store"] == "postgres")
    assert health["now"] == clock.now


async def test_creates_a_run_from_messy_input_and_acts_on_it(client: AsyncClient, clock: FakeClock) -> None:
    domains = ["https://www.wri.org/research", "wri.org", "e3g.org", "not a domain"]
    created = await client.post("/api/runs", json=_new_run("Climate think tanks", domains))
    assert created.status_code == 201
    summary = RunSummary.model_validate_json(created.content)
    assert summary.domain_count == 2
    assert summary.created_by == "You"
    assert "recrawlEveryDays" not in created.json()["settings"]

    clock.now += 30_000
    detail = RunDetail.model_validate_json((await client.get(f"/api/runs/{summary.id}")).content)
    assert [d.domain for d in detail.domains] == ["wri.org", "e3g.org"]

    paused = await client.post(f"/api/runs/{summary.id}/actions", json={"type": "pause", "domains": ["wri.org"]})
    assert RunDetail.model_validate_json(paused.content).domains[0].status == "paused"
    assert paused.json()["actions"][0].keys() == {"id", "at", "type", "actor", "domains"}

    invalid = await client.post(
        f"/api/runs/{summary.id}/actions", json={"type": "resolve", "remedy": "solved_session", "domains": ["wri.org"]}
    )
    assert invalid.status_code == 409
    assert _error(invalid).error == "“resolve” is not possible for wri.org right now"


async def test_rejects_malformed_bodies_with_400(client: AsyncClient) -> None:
    response = await client.post("/api/runs", json={"name": "x"})
    assert response.status_code == 400
    error = _error(response)
    assert error.error == "Invalid request body"
    body = response.json()
    assert set(body["issues"]["properties"]) == {"name", "mode", "settings", "domains"}
    assert body["issues"]["errors"] == []


@pytest.mark.parametrize(
    "body",
    [
        {"speed": 5},
        {"speed": True},
        {"speed": "10"},
        {},
        [],
    ],
)
async def test_validates_demo_speed_like_zod(client: AsyncClient, body: object) -> None:
    assert (await client.post("/api/demo", json=body)).status_code == 400


async def test_rejects_unparseable_json(client: AsyncClient) -> None:
    response = await client.post("/api/validate", content=b"{nope", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["issues"]["errors"] != []


async def test_reports_no_valid_domains_with_reasons(client: AsyncClient) -> None:
    response = await client.post("/api/runs", json=_new_run("Nothing valid", ["imf", "10.0.0.1"]))
    assert response.status_code == 400
    assert response.json() == {
        "error": "No valid domains in the list",
        "issues": [
            {"input": "imf", "reason": "Missing top-level domain (e.g. .org)"},
            {"input": "10.0.0.1", "reason": "IP addresses are not crawlable sources"},
        ],
    }


async def test_time_travels_with_at(client: AsyncClient, clock: FakeClock) -> None:
    past = RunDetail.model_validate_json(
        (await client.get(f"/api/runs/run_igo_weekly?at={clock.now - 1_800_000}")).content
    )
    live = RunDetail.model_validate_json((await client.get("/api/runs/run_igo_weekly")).content)
    assert past.counters.pages < live.counters.pages
    future = RunDetail.model_validate_json((await client.get(f"/api/runs/run_igo_weekly?at={clock.now * 2}")).content)
    assert future.at == clock.now


async def test_serves_a_focused_context_graph_and_validates_the_focus(client: AsyncClient) -> None:
    response = await client.get("/api/graph", params={"focus": "run:run_igo_weekly"})
    assert response.status_code == 200
    graph = Graph.model_validate_json(response.content)
    assert next(n for n in graph.nodes if n.id == "run:run_igo_weekly").depth == 0
    bad = await client.get("/api/graph", params={"focus": "planet:mars"})
    assert bad.status_code == 400
    missing = await client.get("/api/graph", params={"focus": "run:missing"})
    assert missing.status_code == 404
    assert _error(missing).error == "Nothing called run:missing in the data"


async def test_assigns_owners_and_keeps_notes_on_domains(client: AsyncClient) -> None:
    first = ISSUES.validate_json((await client.get("/api/issues")).content)[0]
    url = f"/api/runs/{first.run_id}/actions"
    assigned = await client.post(
        url, json={"type": "assign", "domains": [first.domain], "assignee": "Sonia", "actor": "Sonia"}
    )
    detail = RunDetail.model_validate_json(assigned.content)
    assert next(d for d in detail.domains if d.domain == first.domain).owner == "Sonia"
    noted = await client.post(
        url, json={"type": "note", "domains": [first.domain], "note": "  Emailed their webmaster ", "actor": "Sonia"}
    )
    detail = RunDetail.model_validate_json(noted.content)
    assert [n.text for n in next(d for d in detail.domains if d.domain == first.domain).notes] == [
        "Emailed their webmaster"
    ]
    empty = await client.post(url, json={"type": "note", "domains": [first.domain]})
    assert empty.status_code == 400
    assert _error(empty).error == "A note needs some text"
    no_assignee = await client.post(url, json={"type": "assign", "domains": [first.domain]})
    assert _error(no_assignee).error == "assign needs an assignee (or null to unassign)"
    after = next(i for i in ISSUES.validate_json((await client.get("/api/issues")).content) if i.domain == first.domain)
    assert (after.owner, after.notes) == ("Sonia", 1)


async def test_guards_run_level_actions(client: AsyncClient) -> None:
    url = "/api/runs/run_health_ngos/actions"
    assert (await client.post(url, json={"type": "resume_run"})).status_code == 409
    assert (await client.post(url, json={"type": "pause_run"})).status_code == 200
    again = await client.post(url, json={"type": "pause_run"})
    assert _error(again).error == "The run is already paused"
    assert (await client.post(url, json={"type": "cancel_run", "note": "Done here"})).status_code == 200
    cancelled = await client.post(url, json={"type": "resume_run"})
    assert (cancelled.status_code, _error(cancelled).error) == (409, "This run was cancelled")
    missing = await client.post("/api/runs/run_nope/actions", json={"type": "pause_run"})
    assert (missing.status_code, _error(missing).error) == (404, "Run run_nope not found")


async def test_exports_csv(client: AsyncClient) -> None:
    response = await client.get("/api/issues.csv")
    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    assert response.headers["content-disposition"] == 'attachment; filename="flamer-blocked-domains.csv"'
    header, *rows = response.text.strip().split("\n")
    assert header == "domain,run,blocker,blocked_since,attempt,owner,notes,progress,publisher_declined"
    assert len(rows) > 0
    registry = (await client.get("/api/domains.csv")).text.split("\n")
    assert registry[0].startswith("domain,organisation,type,city,country,latest_status")
    assert any(line.startswith("who.int,World Health Organization,Intergovernmental,Geneva,") for line in registry)


async def test_validates_pasted_lists_and_flags_domains_in_flight(client: AsyncClient) -> None:
    response = await client.post("/api/validate", json={"text": "domain\nmsf.org\nmsf.org\nexample.org\nnope"})
    result = ValidationResult.model_validate_json(response.content)
    assert result.valid == ["msf.org", "example.org"]
    assert result.duplicates == ["msf.org"]
    assert [(f.domain, f.run) for f in result.in_flight] == [("msf.org", "Health NGOs · new sources")]


async def test_publishes_an_openapi_document_and_docs(client: AsyncClient) -> None:
    data = (await client.get("/api/openapi.json")).json()
    assert data["openapi"].startswith("3.1")
    assert "/api/runs/{runId}/actions" in data["paths"]
    docs = await client.get("/api/docs")
    assert docs.headers["content-type"] == "text/html; charset=utf-8"
    assert 'data-url="./openapi.json"' in docs.text


async def test_unknown_routes_answer_like_the_typescript_router(client: AsyncClient) -> None:
    assert _error(await client.get("/api/nope")).error == "No route for GET /api/nope"
    assert _error(await client.post("/api/overview")).error == "No route for POST /api/overview"
    assert _error(await client.get("/api/runs/bad.id")).error == "No route for GET /api/runs/bad.id"
    assert _error(await client.get("/api")).error == "No route for GET /api/"
    assert (await client.get("/api/overview/")).status_code == 200


async def test_isolates_visitor_sandboxes_speeds_up_the_demo_clock_and_resets(
    client: AsyncClient, clock: FakeClock
) -> None:
    created = await client.post("/api/runs", json=_new_run("Shared only", ["wri.org"], concurrency=1))
    mine = RUNS.validate_json((await client.get("/api/runs", headers=SANDBOX)).content)
    assert created.json()["id"] not in [r.id for r in mine]
    assert len(mine) == 4

    before = DemoState.model_validate_json((await client.get("/api/demo", headers=SANDBOX)).content)
    assert (before.speed, before.sandbox) == (1, "visitor0000001")
    await client.post("/api/demo", json={"speed": 60}, headers=SANDBOX)
    clock.now += 60_000
    after = DemoState.model_validate_json((await client.get("/api/demo", headers=SANDBOX)).content)
    assert after.speed == 60
    assert after.now - before.now >= 60 * 60_000
    shared = DemoState.model_validate_json((await client.get("/api/demo")).content)
    assert (shared.speed, shared.sandbox) == (1, None)

    reset = DemoState.model_validate_json((await client.post("/api/demo/reset", headers=SANDBOX)).content)
    assert reset.speed == 1
    assert len(RUNS.validate_json((await client.get("/api/runs", headers=SANDBOX)).content)) == 4
    by_query = RUNS.validate_json((await client.get("/api/runs", params={"sandbox": "visitor0000001"})).content)
    assert len(by_query) == 4


async def test_streams_pulses_over_sse(client: AsyncClient) -> None:
    response = await client.get("/api/stream")
    assert response.headers["content-type"] == "text/event-stream"
    assert response.headers["cache-control"] == "no-cache, no-transform"
    assert response.text.startswith("retry: 1500\n\n")
    pulse = next(block for block in response.text.split("\n\n") if block.startswith("event: pulse"))
    assert pulse.split("\n")[1].startswith('data: {"now":')
