from typing import Final

from flamer.geo import org_of
from flamer.graph import build_graph
from flamer.seed import seed_records
from flamer.sim.engine import simulate_run

NOW: Final = 1_793_275_200_000
DETAILS: Final = [simulate_run(r, NOW) for r in seed_records(NOW)]


def test_places_known_organisations_at_their_headquarters() -> None:
    org = org_of("who.int")
    assert (org.name, org.type) == ("World Health Organization", "intergovernmental")
    assert org.place is not None
    assert (org.place.city, org.place.country, org.place.iso) == ("Geneva", "CH", "756")


def test_falls_back_to_the_country_from_the_domain_suffix() -> None:
    statistik = org_of("statistik.at")
    assert statistik.type == "unknown"
    assert statistik.place is not None
    assert (statistik.place.country, statistik.place.city) == ("AT", None)
    wales = org_of("gov.wales.gov.uk")
    assert wales.type == "government"
    assert wales.place is not None
    assert wales.place.country == "GB"
    epa = org_of("epa.gov")
    assert epa.place is not None
    assert (epa.type, epa.place.country) == ("government", "US")
    assert org_of("unido.int").model_dump() == {"name": None, "type": "intergovernmental", "place": None}


def test_leaves_generic_domains_unplaced() -> None:
    assert org_of("some-ngo.org").place is None


def test_connects_runs_domains_blockers_and_countries() -> None:
    graph = build_graph(DETAILS, None, NOW)
    assert graph is not None
    assert sorted({n.kind for n in graph.nodes}) == ["blocker", "country", "domain", "run"]
    ids = {n.id for n in graph.nodes}
    assert all(e.source in ids and e.target in ids for e in graph.edges)
    assert any(e.source == "domain:who.int" and e.target == "country:CH" for e in graph.edges)


def test_extracts_a_two_step_neighbourhood_around_the_focus() -> None:
    graph = build_graph(DETAILS, "domain:who.int", NOW)
    assert graph is not None
    assert next(n for n in graph.nodes if n.id == "domain:who.int").depth == 0
    depth1 = [n.id for n in graph.nodes if n.depth == 1]
    assert "run:run_igo_weekly" in depth1
    assert "country:CH" in depth1
    assert any(n.id == "domain:wto.org" and n.depth == 2 for n in graph.nodes)
    assert all(n.depth is not None and n.depth <= 2 for n in graph.nodes)


def test_returns_none_for_an_unknown_focus() -> None:
    assert build_graph(DETAILS, "domain:nowhere.example", NOW) is None
