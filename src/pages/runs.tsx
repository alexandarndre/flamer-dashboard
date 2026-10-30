import { Link, getRouteApi } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { queries } from '@/lib/api'
import { useNow } from '@/lib/live'
import { ago, duration, num, pct, short } from '@/lib/format'
import type { RunFilter } from '@/lib/search'
import { PACE_INFO } from '@/shared/catalog'
import type { RunStatus } from '@/shared/contract'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/blocks'
import { RunStatusBadge, StatusBar } from '@/components/status'

const route = getRouteApi('/runs')

const MATCH: Record<RunFilter, (s: RunStatus) => boolean> = {
  all: () => true,
  active: (s) => s === 'running' || s === 'paused',
  attention: (s) => s === 'blocked',
  finished: (s) => s === 'completed' || s === 'cancelled',
}

export function RunsPage() {
  const { data: runs } = useSuspenseQuery(queries.runs())
  const filter = route.useSearch({ select: (s) => s.filter ?? 'all' })
  const navigate = route.useNavigate()
  const now = useNow()
  const visible = runs.filter((r) => MATCH[filter](r.status) || (filter === 'attention' && r.attention > 0))

  return (
    <div className="mx-auto grid max-w-7xl gap-6">
      <PageHeader
        title="Crawl runs"
        description="A run is one batch of domains crawled together with the same settings."
        actions={
          <Button asChild>
            <Link to="/runs/new">
              <Plus /> New crawl
            </Link>
          </Button>
        }
      />
      <Tabs
        value={filter}
        onValueChange={(v) =>
          navigate({ search: { filter: v === 'all' ? undefined : (v as RunFilter) }, viewTransition: false })
        }
      >
        <TabsList>
          {(['all', 'active', 'attention', 'finished'] as const).map((f) => (
            <TabsTrigger key={f} value={f} className="gap-1.5">
              {{ all: 'All', active: 'In progress', attention: 'Needs you', finished: 'Finished' }[f]}
              <span className="text-muted-foreground tabular-nums">
                {runs.filter((r) => MATCH[f](r.status) || (f === 'attention' && r.attention > 0)).length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {visible.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No runs here</EmptyTitle>
            <EmptyDescription>Start a crawl by pasting a list of domains.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link to="/runs/new">New crawl</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table className="min-w-[56rem]">
            <TableHeader className="bg-muted/60">
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-56">Domains</TableHead>
                <TableHead className="text-right">Published</TableHead>
                <TableHead className="text-right">Duplicates</TableHead>
                <TableHead className="text-right">Speed</TableHead>
                <TableHead>Timing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((run) => (
                <TableRow
                  key={run.id}
                  className="cursor-pointer"
                  onClick={() => navigate({ to: '/runs/$runId', params: { runId: run.id } })}
                >
                  <TableCell>
                    <Link to="/runs/$runId" params={{ runId: run.id }} className="font-medium hover:underline">
                      {run.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {run.mode === 'backfill' ? 'Backfill' : 'Recrawl'} · {PACE_INFO[run.settings.pace].label} ·{' '}
                      {run.createdBy}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="grid justify-items-start gap-1">
                      <RunStatusBadge status={run.status} />
                      {run.attention > 0 && <span className="text-xs text-danger">{run.attention} need you</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="grid gap-1.5">
                      <StatusBar counts={run.statusCounts} />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {pct(run.progress)} · {run.statusCounts.completed}/{run.domainCount} done
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {num(run.counters.published + run.counters.updated)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{num(run.counters.duplicates)}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {run.pagesPerMin > 0 ? `${short(run.pagesPerMin)}/min` : '–'}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    <div>started {ago(run.createdAt, now)}</div>
                    <div className="text-xs text-muted-foreground">
                      {run.etaSec !== null
                        ? `~${duration(run.etaSec)} left`
                        : run.finishedAt !== null
                          ? `ran for ${duration((run.finishedAt - run.createdAt) / 1000)}`
                          : 'waiting on decisions'}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
