import { Suspense, useState } from 'react'
import { toast } from 'sonner'
import { Link, getRouteApi, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Crosshair, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { queries } from '@/lib/api'
import { num, plural } from '@/lib/format'
import {
  ORG_TYPES,
  type Blocker,
  type Graph,
  type GraphEdge,
  type GraphNode,
  type GraphNodeKind,
  type GraphTone,
} from '@/shared/contract'
import { ORG_TYPE_LABEL, countryName } from '@/shared/geo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { PageHeader, SectionCard } from '@/components/blocks'
import { KIND_LABEL, RelationGraph } from '@/components/relation-graph'
import { WorldMap, summarizeMap, type MapCluster, type MapItem } from '@/components/world-map'

const route = getRouteApi('/explore')

const UNPLACED = 'country:??'
const TONE_RANK: Record<GraphTone, number> = { danger: 5, warn: 4, info: 3, success: 2, brand: 1, muted: 0 }

function groupByCountry(graph: Graph): Graph {
  const countryOf = new Map(graph.edges.filter((e) => e.kind === 'located_in').map((e) => [e.source, e.target]))
  const counts = new Map<string, number>()
  for (const n of graph.nodes)
    if (n.kind === 'domain') {
      const c = countryOf.get(n.id) ?? UNPLACED
      counts.set(c, (counts.get(c) ?? 0) + 1)
    }
  const nodes: GraphNode[] = graph.nodes
    .filter((n) => n.kind !== 'domain')
    .map((n) =>
      n.kind === 'country' ? { ...n, weight: counts.get(n.id) ?? 0, sub: plural(counts.get(n.id) ?? 0, 'source') } : n,
    )
  if (counts.has(UNPLACED))
    nodes.push({
      id: UNPLACED,
      kind: 'country',
      label: 'Location unknown',
      sub: plural(counts.get(UNPLACED)!, 'source'),
      tone: 'muted',
      weight: counts.get(UNPLACED)!,
      depth: null,
    })
  const edges = new Map<string, GraphEdge>()
  for (const e of graph.edges) {
    if (e.kind === 'located_in') continue
    const edge =
      e.kind === 'crawled'
        ? { ...e, target: countryOf.get(e.target) ?? UNPLACED }
        : { ...e, source: countryOf.get(e.source) ?? UNPLACED }
    const key = `${edge.source}->${edge.target}`
    const existing = edges.get(key)
    if (existing === undefined || TONE_RANK[edge.tone] > TONE_RANK[existing.tone]) edges.set(key, edge)
  }
  return { ...graph, nodes, edges: [...edges.values()] }
}

const KIND_ORDER: GraphNodeKind[] = ['run', 'blocker', 'country', 'domain']

const KIND_PLURAL: Record<GraphNodeKind, string> = {
  run: 'Runs',
  domain: 'Domains',
  blocker: 'Blockers',
  country: 'Countries',
}

const LEGEND = [
  { label: 'Run', className: 'rounded-full bg-brand' },
  { label: 'Done', className: 'rounded-full bg-success' },
  { label: 'Crawling', className: 'rounded-full bg-info' },
  { label: 'Needs you', className: 'rounded-full bg-danger' },
  { label: 'Blocker', className: 'rotate-45 rounded-[2px] border border-danger bg-danger/20' },
  { label: 'Country', className: 'rounded-full border border-dashed border-muted-foreground' },
]

export function ExplorePage() {
  const { focus } = route.useSearch()
  const navigate = useNavigate()
  const graph = useQuery(queries.graph(focus))
  const { data: registry = [] } = useQuery(queries.domains())
  const setFocus = (id?: string) => navigate({ to: '/explore', search: { focus: id }, viewTransition: false })

  const [grouped, setGrouped] = useState(true)
  const [query, setQuery] = useState('')
  const view =
    graph.data === undefined ? undefined : focus === undefined && grouped ? groupByCountry(graph.data) : graph.data
  const nodes = graph.data?.nodes ?? []
  const focusNode = nodes.find((n) => n.depth === 0)
  const domainsInView = new Set(nodes.filter((n) => n.kind === 'domain').map((n) => n.label))
  const mapItems: MapItem[] = registry
    .filter((e) => focus === undefined || domainsInView.has(e.domain))
    .map((e) => ({ domain: e.domain, status: e.lastStatus, docs: e.published, org: e.org }))
  const summary = summarizeMap(mapItems)
  const lastRunOf = new Map(registry.map((e) => [e.domain, e.lastRunId]))

  const open = (node: GraphNode) => {
    const [kind, ...rest] = node.id.split(':')
    const key = rest.join(':')
    if (kind === 'run') void navigate({ to: '/runs/$runId', params: { runId: key } })
    else if (kind === 'domain' && lastRunOf.has(key))
      void navigate({ to: '/runs/$runId', params: { runId: lastRunOf.get(key)! }, search: { domain: key } })
    else if (kind === 'blocker') void navigate({ to: '/issues', search: { blocker: key as Blocker } })
  }

  const selectCluster = (cluster: MapCluster) =>
    setFocus(cluster.items.length === 1 ? `domain:${cluster.items[0]!.domain}` : `country:${cluster.place.country}`)

  return (
    <div className="mx-auto grid max-w-7xl gap-6">
      <PageHeader
        title="Explore"
        description="Where the sources are and how runs, domains, blockers and countries connect. Click anything to focus on it."
      />

      <form
        className="flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const q = query.trim().toLowerCase()
          if (q === '') return
          const match =
            nodes.find((n) => n.label.toLowerCase() === q) ??
            registry.find((d) => d.domain === q || d.org.name?.toLowerCase() === q)
          if (match === undefined) return toast.error(`Nothing called “${query}”`)
          setFocus('id' in match ? match.id : `domain:${match.domain}`)
          setQuery('')
        }}
      >
        <InputGroup className="h-8">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            list="explore-targets"
            placeholder="Find a run, domain, organisation, blocker or country…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Find in graph"
          />
        </InputGroup>
        <datalist id="explore-targets">
          {[
            ...new Set([
              ...nodes.filter((n) => n.kind !== 'domain').map((n) => n.label),
              ...registry.map((d) => d.domain),
            ]),
          ].map((label) => (
            <option key={label} value={label} />
          ))}
        </datalist>
        <Button type="submit" size="sm" variant="outline">
          Focus
        </Button>
      </form>

      <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-sm">
        <Crosshair className="size-4 text-muted-foreground" />
        {focusNode !== undefined ? (
          <>
            <span className="text-muted-foreground">Focused on</span>
            <Badge variant="outline">{KIND_LABEL[focusNode.kind]}</Badge>
            <span className="font-medium">{focusNode.label}</span>
            <span className="hidden text-muted-foreground md:inline">· {focusNode.sub}</span>
            <div className="ml-auto flex gap-1.5">
              {focusNode.kind !== 'country' && (
                <Button size="xs" variant="outline" onClick={() => open(focusNode)}>
                  Open <ArrowUpRight />
                </Button>
              )}
              <Button size="xs" variant="ghost" onClick={() => setFocus(undefined)}>
                <X /> Show everything
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="text-muted-foreground">Focus on</span>
            {nodes
              .filter((n) => n.kind === 'run' || n.kind === 'blocker')
              .toSorted((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
              .map((n) => (
                <Button
                  key={n.id}
                  size="xs"
                  variant="outline"
                  className={cn(n.kind === 'blocker' && 'border-danger/30 text-danger')}
                  onClick={() => setFocus(n.id)}
                >
                  {n.label}
                </Button>
              ))}
          </>
        )}
      </div>

      {graph.error !== null && (
        <p className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm">
          {graph.error.message}.{' '}
          <button type="button" className="underline" onClick={() => setFocus(undefined)}>
            Show everything
          </button>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <SectionCard
          title="Connections"
          description={
            view === undefined
              ? 'Loading…'
              : `${plural(view.nodes.length, 'item')}, ${plural(view.edges.length, 'link')}${view.hidden > 0 ? ` · ${view.hidden} further away hidden` : ''}`
          }
          action={
            focus === undefined && (
              <Label className="flex items-center gap-2 text-xs font-normal">
                <Switch checked={grouped} onCheckedChange={setGrouped} />
                Group domains by country
              </Label>
            )
          }
          className="lg:col-span-3"
          contentClassName="grid gap-3"
        >
          <div className="h-[34rem] overflow-hidden rounded-lg border bg-muted/20">
            {view === undefined ? (
              <Skeleton className="size-full" />
            ) : (
              <RelationGraph
                key={`${focus ?? 'all'}:${grouped}`}
                graph={view}
                onSelect={(n) => (n.id === UNPLACED ? undefined : n.depth === 0 ? open(n) : setFocus(n.id))}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {LEGEND.map((l) => (
              <span key={l.label} className="flex items-center gap-1.5">
                <span className={cn('inline-block size-2.5', l.className)} /> {l.label}
              </span>
            ))}
            <span className="ml-auto">Click to focus · click the focused item to open it</span>
          </div>
        </SectionCard>

        <div className="grid content-start gap-4 lg:col-span-2">
          <SectionCard
            title="Map"
            description={`${plural(summary.sources, 'source')} in ${plural(summary.countries, 'country', 'countries')}${summary.unplaced > 0 ? ` · ${summary.unplaced} unplaced` : ''}`}
          >
            <Suspense fallback={<Skeleton className="aspect-[2/1] w-full" />}>
              <WorldMap
                items={mapItems}
                highlight={focus?.startsWith('domain:') === true ? focus.slice(7) : undefined}
                selectedCountry={focus?.startsWith('country:') === true ? focus.slice(8) : undefined}
                onSelect={selectCluster}
                onSelectCountry={(cc) => setFocus(`country:${cc}`)}
              />
            </Suspense>
          </SectionCard>

          <SectionCard
            title={focusNode === undefined ? 'Coverage' : 'Connected to'}
            description={focusNode === undefined ? 'What kind of publishers we crawl, and where' : focusNode.label}
            contentClassName="grid gap-4"
          >
            {focusNode !== undefined ? (
              <>
                <NodeGroups nodes={nodes.filter((n) => n.depth === 1)} onFocus={setFocus} />
                {nodes.some((n) => n.depth === 2) && (
                  <div className="grid gap-3 border-t pt-3">
                    <div className="text-xs text-muted-foreground">Through those</div>
                    <NodeGroups nodes={nodes.filter((n) => n.depth === 2 && n.kind !== 'domain')} onFocus={setFocus} />
                  </div>
                )}
              </>
            ) : (
              <Coverage items={mapItems} onCountry={(cc) => setFocus(`country:${cc}`)} />
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

function NodeGroups({ nodes, onFocus }: { nodes: GraphNode[]; onFocus: (id: string) => void }) {
  return KIND_ORDER.map((kind) => {
    const linked = nodes.filter((n) => n.kind === kind).toSorted((a, b) => b.weight - a.weight)
    if (linked.length === 0) return null
    return (
      <div key={kind} className="grid gap-1.5">
        <div className="text-xs font-medium text-muted-foreground">
          {KIND_PLURAL[kind]} · {linked.length}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {linked.slice(0, 24).map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onFocus(n.id)}
              title={n.sub}
              className={cn(
                'rounded-md border px-2 py-0.5 text-xs hover:bg-muted',
                n.kind === 'blocker' && 'border-danger/30 text-danger',
              )}
            >
              {n.label}
            </button>
          ))}
          {linked.length > 24 && <span className="px-1 text-xs text-muted-foreground">+{linked.length - 24} more</span>}
        </div>
      </div>
    )
  })
}

function Coverage({ items, onCountry }: { items: MapItem[]; onCountry: (cc: string) => void }) {
  const byType = ORG_TYPES.map((type) => ({ type, n: items.filter((i) => i.org.type === type).length })).filter(
    (t) => t.n > 0,
  )
  const byCountry = Object.entries(
    Object.groupBy(
      items.filter((i) => i.org.place !== null),
      (i) => i.org.place!.country,
    ),
  )
    .map(([cc, list]) => ({ cc, n: list!.length, docs: list!.reduce((s, i) => s + i.docs, 0) }))
    .toSorted((a, b) => b.n - a.n)
  const max = Math.max(1, ...byCountry.map((c) => c.n))
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {byType.map((t) => (
          <Badge key={t.type} variant="secondary">
            {ORG_TYPE_LABEL[t.type]} · {t.n}
          </Badge>
        ))}
      </div>
      <ul className="grid gap-1.5">
        {byCountry.slice(0, 8).map((c) => (
          <li key={c.cc}>
            <button
              type="button"
              onClick={() => onCountry(c.cc)}
              className="grid w-full grid-cols-[minmax(0,1fr)_5rem_4rem] items-center gap-3 text-left text-sm hover:text-brand"
            >
              <span className="truncate">{countryName(c.cc)}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-brand" style={{ width: `${(c.n / max) * 100}%` }} />
              </span>
              <span className="text-right text-xs text-muted-foreground tabular-nums">
                {c.n} · {num(c.docs)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Sources per country · documents published. Click a country to see its sources.{' '}
        <Link to="/domains" className="underline">
          All domains
        </Link>
      </p>
    </>
  )
}
