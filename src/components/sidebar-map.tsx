import { Link, useNavigate, useRouterState, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Maximize2 } from 'lucide-react'
import { queries } from '@/lib/api'
import { orgOf } from '@/shared/geo'
import { Button } from '@/components/ui/button'
import { SidebarGroup, SidebarGroupAction, SidebarGroupContent, SidebarGroupLabel } from '@/components/ui/sidebar'
import { WorldMap, summarizeMap, type MapCluster, type MapItem } from './world-map'

export function SidebarMap() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const search = useSearch({ strict: false })
  const navigate = useNavigate()
  const runId = /^\/runs\/(?!new$)([^/]+)$/.exec(pathname)?.[1]
  const run = useQuery({ ...queries.run(runId ?? '', search.at), enabled: runId !== undefined })
  const registry = useQuery({ ...queries.domains(), enabled: runId === undefined })

  const items: MapItem[] =
    runId !== undefined
      ? (run.data?.domains ?? []).map((d) => ({
          domain: d.domain,
          status: d.status,
          docs: d.counters.published + d.counters.updated,
          org: orgOf(d.domain),
        }))
      : (registry.data ?? []).map((e) => ({ domain: e.domain, status: e.lastStatus, docs: e.published, org: e.org }))
  const summary = summarizeMap(items)
  const focus =
    runId === undefined ? undefined : search.domain !== undefined ? `domain:${search.domain}` : `run:${runId}`

  const select = (cluster: MapCluster) => {
    const [only] = cluster.items
    if (cluster.items.length === 1 && runId !== undefined)
      void navigate({ to: '/runs/$runId', params: { runId }, search: { at: search.at, domain: only!.domain } })
    else if (cluster.items.length === 1) void navigate({ to: '/explore', search: { focus: `domain:${only!.domain}` } })
    else void navigate({ to: '/explore', search: { focus: `country:${cluster.place.country}` } })
  }

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>{runId === undefined ? 'Source map' : 'This run on the map'}</SidebarGroupLabel>
      <SidebarGroupAction asChild title="Open in Explore">
        <Link to="/explore" search={{ focus }}>
          <Maximize2 />
        </Link>
      </SidebarGroupAction>
      <SidebarGroupContent className="grid gap-1.5 px-1">
        <div className="rounded-lg border bg-background/60 p-1">
          <WorldMap items={items} compact highlight={search.domain} onSelect={select} />
        </div>
        <p className="px-1 text-[11px] leading-snug text-muted-foreground">
          {summary.sources} sources in {summary.countries} countries
          {summary.unplaced > 0 && ` · ${summary.unplaced} without location`}
        </p>
        <Button variant="ghost" size="xs" className="justify-start text-muted-foreground" asChild>
          <Link to="/explore" search={{ focus }}>
            Explore connections →
          </Link>
        </Button>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
