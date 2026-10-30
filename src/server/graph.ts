import { BLOCKER_INFO, RUN_STATUS_INFO, STATUS_INFO } from '../shared/catalog'
import type { Graph, GraphEdge, GraphNode, RunDetail } from '../shared/contract'
import { ORG_TYPE_LABEL, orgOf } from '../shared/geo'

const MAX_NODES = 140

export function buildGraph(details: RunDetail[], focus: string | null, at: number): Graph | null {
  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const neighbours = new Map<string, Set<string>>()

  const node = (n: Omit<GraphNode, 'depth'>) => {
    const existing = nodes.get(n.id)
    if (existing === undefined) nodes.set(n.id, { ...n, depth: null })
    else existing.weight += n.weight
  }
  const link = (edge: GraphEdge) => {
    edges.push(edge)
    for (const [a, b] of [
      [edge.source, edge.target],
      [edge.target, edge.source],
    ] as const)
      neighbours.set(a, (neighbours.get(a) ?? new Set()).add(b))
  }

  for (const run of details.toSorted((a, b) => b.createdAt - a.createdAt)) {
    const runId = `run:${run.id}`
    node({
      id: runId,
      kind: 'run',
      label: run.name,
      sub: `${RUN_STATUS_INFO[run.status].label} · ${run.domainCount} domains`,
      tone: 'brand',
      weight: run.counters.published + run.counters.updated,
    })
    for (const d of run.domains) {
      const domainId = `domain:${d.domain}`
      const org = orgOf(d.domain)
      if (!nodes.has(domainId))
        node({
          id: domainId,
          kind: 'domain',
          label: d.domain,
          sub: [org.name, ORG_TYPE_LABEL[org.type], STATUS_INFO[d.status].label].filter((x) => x !== null).join(' · '),
          tone: STATUS_INFO[d.status].tone,
          weight: 0,
        })
      nodes.get(domainId)!.weight += d.counters.published + d.counters.updated
      link({ source: runId, target: domainId, kind: 'crawled', tone: STATUS_INFO[d.status].tone })
      if (d.blocker !== null && !neighbours.get(domainId)?.has(`blocker:${d.blocker}`)) {
        node({
          id: `blocker:${d.blocker}`,
          kind: 'blocker',
          label: BLOCKER_INFO[d.blocker].title,
          sub: 'Blocker',
          tone: 'danger',
          weight: 1,
        })
        link({ source: domainId, target: `blocker:${d.blocker}`, kind: 'blocked_by', tone: 'danger' })
      }
      if (org.place !== null && !neighbours.get(domainId)?.has(`country:${org.place.country}`)) {
        node({
          id: `country:${org.place.country}`,
          kind: 'country',
          label: org.place.countryName,
          sub: 'Country',
          tone: 'muted',
          weight: 1,
        })
        link({ source: domainId, target: `country:${org.place.country}`, kind: 'located_in', tone: 'muted' })
      }
    }
  }

  if (focus !== null && !nodes.has(focus)) return null

  let keep: Set<string>
  if (focus === null) keep = new Set(nodes.keys())
  else {
    keep = new Set([focus])
    nodes.get(focus)!.depth = 0
    let frontier = [focus]
    for (let depth = 1; depth <= 2; depth++) {
      const next = [...new Set(frontier.flatMap((id) => [...(neighbours.get(id) ?? [])]))]
        .filter((id) => !keep.has(id))
        .toSorted((a, b) => nodes.get(b)!.weight - nodes.get(a)!.weight)
      for (const id of next) {
        if (depth === 2 && keep.size >= MAX_NODES) break
        keep.add(id)
        nodes.get(id)!.depth = depth
      }
      frontier = next.filter((id) => keep.has(id))
    }
  }

  return {
    at,
    focus,
    nodes: [...nodes.values()].filter((n) => keep.has(n.id)),
    edges: edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
    hidden: nodes.size - keep.size,
  }
}
