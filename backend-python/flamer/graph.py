from typing import Final

from flamer.catalog import BLOCKER_INFO, RUN_STATUS_LABEL, STATUS_INFO
from flamer.contract import Graph, GraphEdge, GraphNode, RunDetail
from flamer.geo import ORG_TYPE_LABEL, org_of

MAX_NODES: Final = 140


class _GraphBuilder:
    def __init__(self) -> None:
        self.nodes: dict[str, GraphNode] = {}
        self.edges: list[GraphEdge] = []
        self.neighbours: dict[str, dict[str, None]] = {}

    def node(self, node: GraphNode) -> None:
        existing = self.nodes.get(node.id)
        if existing is None:
            self.nodes[node.id] = node
        else:
            existing.weight += node.weight

    def link(self, edge: GraphEdge) -> None:
        self.edges.append(edge)
        for a, b in ((edge.source, edge.target), (edge.target, edge.source)):
            self.neighbours.setdefault(a, {})[b] = None

    def linked(self, a: str, b: str) -> bool:
        return b in self.neighbours.get(a, {})

    def add_run(self, run: RunDetail) -> None:
        run_id = f"run:{run.id}"
        self.node(
            GraphNode(
                id=run_id,
                kind="run",
                label=run.name,
                sub=f"{RUN_STATUS_LABEL[run.status]} · {run.domain_count} domains",
                tone="brand",
                weight=run.counters.published + run.counters.updated,
                depth=None,
            )
        )
        for d in run.domains:
            domain_id = f"domain:{d.domain}"
            org = org_of(d.domain)
            status = STATUS_INFO[d.status]
            if domain_id not in self.nodes:
                sub = " · ".join(x for x in (org.name, ORG_TYPE_LABEL[org.type], status.label) if x is not None)
                self.node(
                    GraphNode(
                        id=domain_id, kind="domain", label=d.domain, sub=sub, tone=status.tone, weight=0, depth=None
                    )
                )
            self.nodes[domain_id].weight += d.counters.published + d.counters.updated
            self.link(GraphEdge(source=run_id, target=domain_id, kind="crawled", tone=status.tone))
            if d.blocker is not None and not self.linked(domain_id, blocker_id := f"blocker:{d.blocker}"):
                title = BLOCKER_INFO[d.blocker].title
                self.node(
                    GraphNode(
                        id=blocker_id, kind="blocker", label=title, sub="Blocker", tone="danger", weight=1, depth=None
                    )
                )
                self.link(GraphEdge(source=domain_id, target=blocker_id, kind="blocked_by", tone="danger"))
            if org.place is not None and not self.linked(domain_id, country_id := f"country:{org.place.country}"):
                self.node(
                    GraphNode(
                        id=country_id,
                        kind="country",
                        label=org.place.country_name,
                        sub="Country",
                        tone="muted",
                        weight=1,
                        depth=None,
                    )
                )
                self.link(GraphEdge(source=domain_id, target=country_id, kind="located_in", tone="muted"))

    def neighbourhood(self, focus: str) -> set[str]:
        keep = {focus}
        self.nodes[focus].depth = 0
        frontier = [focus]
        for depth in (1, 2):
            reached = dict.fromkeys(n for node_id in frontier for n in self.neighbours.get(node_id, {}))
            ring = sorted((n for n in reached if n not in keep), key=lambda n: self.nodes[n].weight, reverse=True)
            for node_id in ring:
                if depth == 2 and len(keep) >= MAX_NODES:
                    break
                keep.add(node_id)
                self.nodes[node_id].depth = depth
            frontier = [n for n in ring if n in keep]
        return keep


def build_graph(details: list[RunDetail], focus: str | None, at: float) -> Graph | None:
    builder = _GraphBuilder()
    for run in sorted(details, key=lambda d: d.created_at, reverse=True):
        builder.add_run(run)
    if focus is not None and focus not in builder.nodes:
        return None
    keep = set(builder.nodes) if focus is None else builder.neighbourhood(focus)
    return Graph(
        at=at,
        focus=focus,
        nodes=[n for n in builder.nodes.values() if n.id in keep],
        edges=[e for e in builder.edges if e.source in keep and e.target in keep],
        hidden=len(builder.nodes) - len(keep),
    )
