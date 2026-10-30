from pathlib import Path
from typing import Final

import pytest
from pydantic import BaseModel, TypeAdapter

from flamer.aggregate import overview_of, registry_of, simulate_all
from flamer.contract import RunAction, RunRecord, RunSettings, RunSpec
from flamer.domains import parse_domain_list
from flamer.geo import org_of
from flamer.graph import build_graph
from flamer.seed import seed_records
from flamer.sim.engine import simulate_run
from tests.jsondiff import Json, json_differences

GOLDEN_PATH: Final = Path(__file__).resolve().parents[2] / "fixtures" / "golden.json"
MIN: Final = 60_000
JSON: Final = TypeAdapter[Json](Json)


def _act(n: int, at: float, **fields: object) -> RunAction:
    return RunAction.model_validate({"id": f"act_{n}", "at": at, "actor": "Tester", **fields})


def _scripted(now: int) -> RunRecord:
    return RunRecord(
        spec=RunSpec(
            id="run_scripted",
            name="Scripted operator session",
            mode="backfill",
            settings=RunSettings(concurrency=3, pace="aggressive", respect_robots=True, recrawl_every_days=30),
            domains=["who.int", "ecb.europa.eu", "sipri.org", "wri.org", "imf.org", "statistik.at", "unicef.org"],
            created_at=now - 90 * MIN,
            created_by="Tester",
            seed=1234567,
        ),
        actions=[
            _act(1, now - 89 * MIN, type="pause", domains=["wri.org"]),
            _act(2, now - 75 * MIN, type="pause_run"),
            _act(3, now - 70 * MIN, type="resume_run"),
            _act(4, now - 84 * MIN, type="resume", domains=["wri.org"]),
            _act(5, now - 60 * MIN, type="assign", domains=["who.int"], assignee="Maya R."),
            _act(6, now - 55 * MIN, type="resolve", domains=["who.int"], remedy="solved_session"),
            _act(7, now - 50 * MIN, type="resolve", domains=["ecb.europa.eu"], remedy="request_permission"),
            _act(8, now - 45 * MIN, type="resolve", domains=["sipri.org"], remedy="add_entry_point"),
            _act(9, now - 40 * MIN, type="note", domains=["imf.org"], note="Their CDN is flaky on Fridays"),
            _act(10, now - 35 * MIN, type="skip", domains=["statistik.at"], note="Out of scope"),
        ],
    )


def _json(value: BaseModel | list[BaseModel] | None) -> Json:
    if value is None:
        return None
    if isinstance(value, list):
        return [_json(item) for item in value]
    return JSON.validate_json(value.model_dump_json(exclude_unset=True))


@pytest.fixture(scope="module")
def golden() -> dict[str, Json]:
    loaded = JSON.validate_json(GOLDEN_PATH.read_bytes())
    assert isinstance(loaded, dict)
    return loaded


@pytest.fixture(scope="module")
def actual(golden: dict[str, Json]) -> dict[str, Json]:
    now = golden["now"]
    assert isinstance(now, int)
    records = [*seed_records(now), _scripted(now)]
    details = simulate_all(records, now)
    focuses = [None, "run:run_igo_weekly", "domain:who.int", "country:CH", "blocker:captcha"]
    domains = ["who.int", "statistik.at", "epa.gov", "unido.int", "some-ngo.org", "ons.gov.uk"]
    return {
        "now": now,
        "records": [_json(r) for r in records],
        "runs": [
            {"id": r.spec.id, "at": at, "detail": _json(simulate_run(r, at))}
            for r in records
            for at in (now - 30 * MIN, now)
        ],
        "overview": _json(overview_of(details, now)),
        "registry": [_json(e) for e in registry_of(details)],
        "graphs": [{"focus": f, "graph": _json(build_graph(details, f, now))} for f in focuses],
        "orgs": [[d, _json(org_of(d))] for d in domains],
        "parse": _json(
            parse_domain_list(
                "domain\nhttps://www.WHO.int/publications\nwho.int\noecd.org, imf\n10.0.0.1\nbad_domain.org\n"
                "odi.org; iied.org"
            )
        ),
    }


@pytest.mark.parametrize("section", ["now", "records", "runs", "overview", "registry", "graphs", "orgs", "parse"])
def test_matches_golden_section(golden: dict[str, Json], actual: dict[str, Json], section: str) -> None:
    assert json_differences(golden[section], actual[section])[:20] == []


def test_covers_every_golden_section(golden: dict[str, Json], actual: dict[str, Json]) -> None:
    assert golden.keys() == actual.keys()
