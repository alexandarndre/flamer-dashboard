import { Activity, useState } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  Copy,
  FileCheck2,
  FileX2,
  Gauge,
  Hand,
  Pause,
  Play,
  RotateCcw,
  Square,
  Waypoints,
} from 'lucide-react'
import { useRunActions } from '@/lib/actions'
import { queries } from '@/lib/api'
import { ago, dateTime, duration, num, pct, plural, short } from '@/lib/format'
import { useLive } from '@/lib/live'
import type { RunTab } from '@/lib/search'
import { BLOCKER_INFO, PACE_INFO } from '@/shared/catalog'
import type { Blocker } from '@/shared/contract'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ActivityFeed, DocumentOutcomes, Funnel, Kpi, PageHeader, SectionCard } from '@/components/blocks'
import { DomainSheet } from '@/components/domain-sheet'
import { DomainTable, type DomainFilter } from '@/components/domain-table'
import { IssueRow } from '@/components/remedies'
import { ProgressBar, RunStatusBadge, StatusBar } from '@/components/status'
import { ThroughputChart } from '@/components/throughput-chart'
import { TimeTravel } from '@/components/time-travel'

const route = getRouteApi('/runs/$runId')

export function RunPage() {
  const { runId } = route.useParams()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const live = useLive()
  const actions = useRunActions()
  const { data: run } = useQuery(queries.run(runId, search.at))

  if (run === undefined) return <Skeleton className="h-96 w-full" />

  const tab = search.tab ?? 'domains'
  const readOnly = search.at !== undefined || run.status === 'cancelled'
  const runPending = actions.pending.get(`${run.id}:*`)
  const liveNow = Math.max(run.at, live.pulse?.now ?? run.at)
  const replayEnd = Math.min(liveNow, run.finishedAt ?? liveNow)
  const issues = run.domains
    .filter((d) => d.status === 'needs_attention' && d.blocker !== null)
    .map((d) => ({
      runId: run.id,
      domain: d.domain,
      blocker: d.blocker!,
      since: d.blockedSince ?? run.at,
      attempt: d.attempt,
      remedies: d.remedies,
      ownerDeclined: d.ownerDeclined,
      progress: d.progress,
      owner: d.owner,
      notes: d.notes.length,
    }))
  const byBlocker = Object.entries(Object.groupBy(issues, (i) => i.blocker)) as [Blocker, typeof issues][]
  const setSearch = (patch: Partial<typeof search>) =>
    navigate({ search: (s) => ({ ...s, ...patch }), replace: true, viewTransition: false })

  return (
    <div className="mx-auto grid max-w-7xl gap-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {run.name}
            <RunStatusBadge status={run.status} />
          </span>
        }
        description={
          <>
            {run.mode === 'backfill' ? 'Full backfill' : 'Recrawl for new and changed documents'} · {run.domainCount}{' '}
            domains · {PACE_INFO[run.settings.pace].label.toLowerCase()} pace, {run.settings.concurrency} at a time ·
            started by {run.createdBy} {ago(run.createdAt, liveNow)}
            {!run.settings.respectRobots && ' · ignoring robots.txt'}
            {(run.settings.recrawlEveryDays ?? 0) > 0 &&
              ` · recrawls every ${plural(run.settings.recrawlEveryDays ?? 0, 'day')}`}
          </>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/explore" search={{ focus: `run:${run.id}` }}>
                <Waypoints /> Explore
              </Link>
            </Button>
            {!readOnly && (
              <>
                {issues.length > 0 && (
                  <Button variant="outline" asChild>
                    <Link to="/runs/new" search={{ domains: issues.map((i) => i.domain).join(',') }}>
                      <RotateCcw /> New run for blocked
                    </Link>
                  </Button>
                )}
                {run.paused ? (
                  <Button
                    disabled={runPending !== undefined}
                    onClick={() => actions.act(run.id, { type: 'resume_run' }, 'Resuming', 'Run resumed')}
                  >
                    <Play /> Resume run
                  </Button>
                ) : (
                  run.status === 'running' && (
                    <Button
                      variant="outline"
                      disabled={runPending !== undefined}
                      onClick={() => actions.act(run.id, { type: 'pause_run' }, 'Pausing', 'Run paused')}
                    >
                      <Pause /> Pause run
                    </Button>
                  )
                )}
                {run.status !== 'completed' && (
                  <CancelRunDialog
                    onConfirm={(note) =>
                      actions.act(run.id, { type: 'cancel_run', note }, 'Cancelling', 'Run cancelled')
                    }
                  />
                )}
              </>
            )}
          </>
        }
      >
        <Link to="/runs" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Crawl runs
        </Link>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SectionCard
          title={
            <span className="flex items-baseline gap-3">
              <span className="text-3xl font-semibold tabular-nums">{pct(run.progress)}</span>
              <span className="text-sm font-normal text-muted-foreground">complete</span>
            </span>
          }
          description={
            run.status === 'running' && run.etaSec !== null
              ? `About ${duration(run.etaSec)} to go${issues.length > 0 ? `, not counting ${plural(issues.length, 'blocked domain')}` : ''}`
              : run.finishedAt !== null
                ? `Finished ${dateTime(run.finishedAt)}`
                : 'Waiting for decisions on blocked domains'
          }
          contentClassName="grid gap-4"
        >
          <ProgressBar value={run.progress} tone={run.status === 'blocked' ? 'danger' : 'info'} className="h-2.5" />
          <StatusBar counts={run.statusCounts} />
          <TimeTravel
            start={run.createdAt}
            end={replayEnd}
            value={search.at}
            actions={run.actions}
            onChange={(at) => setSearch({ at })}
          />
        </SectionCard>
        <div className="grid grid-cols-2 gap-4">
          <Kpi label="Speed" icon={<Gauge />} value={`${short(run.pagesPerMin)}/min`} hint="pages & files" />
          <Kpi
            label="Needs you"
            icon={<Hand />}
            tone={run.attention > 0 ? 'danger' : 'success'}
            value={run.attention}
            hint={run.attention > 0 ? 'blocked domains' : 'nothing blocked'}
          />
          <Kpi
            label="Published"
            icon={<FileCheck2 />}
            tone="success"
            value={num(run.counters.published + run.counters.updated)}
            hint={
              run.mode === 'recrawl'
                ? `${num(run.counters.updated)} updated`
                : `${num(run.counters.pdfsFound)} PDFs found`
            }
          />
          <Kpi
            label={run.mode === 'recrawl' ? 'Unchanged' : 'Duplicates'}
            icon={<Copy />}
            value={num(run.counters.duplicates)}
            hint={
              <span className="flex items-center gap-1">
                <FileX2 className="size-3" /> {num(run.counters.rejected)} rejected
              </span>
            }
          />
        </div>
      </div>

      {search.at !== undefined && (
        <p className="-mb-2 text-sm text-brand">
          Viewing a replay from {dateTime(search.at)}. Actions are disabled until you go back to live.
        </p>
      )}

      <Tabs value={tab} onValueChange={(v) => setSearch({ tab: v === 'domains' ? undefined : (v as RunTab) })}>
        <TabsList>
          <TabsTrigger value="domains">Domains</TabsTrigger>
          <TabsTrigger value="issues">
            Needs you{' '}
            {issues.length > 0 && (
              <span className="ml-1 rounded-full bg-danger/15 px-1.5 text-xs text-danger">{issues.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="documents">Documents & speed</TabsTrigger>
        </TabsList>
      </Tabs>

      <Activity mode={tab === 'domains' ? 'visible' : 'hidden'}>
        <DomainTable
          run={run}
          actions={actions}
          readOnly={readOnly}
          filter={(search.filter ?? 'all') as DomainFilter}
          query={search.q ?? ''}
          onFilter={(filter) => setSearch({ filter: filter === 'all' ? undefined : filter })}
          onQuery={(q) => setSearch({ q: q === '' ? undefined : q })}
          onOpen={(domain) => setSearch({ domain })}
        />
      </Activity>

      <Activity mode={tab === 'issues' ? 'visible' : 'hidden'}>
        {issues.length === 0 ? (
          <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            Nothing is blocked in this run.
          </p>
        ) : (
          <div className="grid gap-4">
            {byBlocker.map(([blocker, list]) => (
              <SectionCard
                key={blocker}
                title={`${BLOCKER_INFO[blocker].title} · ${list.length}`}
                description={BLOCKER_INFO[blocker].explain}
                contentClassName="divide-y"
              >
                {list.map((issue) => (
                  <IssueRow key={issue.domain} issue={issue} actions={actions} now={run.at} />
                ))}
              </SectionCard>
            ))}
          </div>
        )}
      </Activity>

      <Activity mode={tab === 'activity' ? 'visible' : 'hidden'}>
        <SectionCard title="Activity" description={`${plural(run.events.length, 'event')} since the run started`}>
          <ActivityFeed events={run.events.toReversed().slice(0, 300)} now={run.at} />
        </SectionCard>
      </Activity>

      <Activity mode={tab === 'documents' ? 'visible' : 'hidden'}>
        <div className="grid gap-4 lg:grid-cols-3">
          <ThroughputChart points={run.throughput} />
          <SectionCard title="Pipeline">
            <Funnel counters={run.counters} />
          </SectionCard>
          <SectionCard title="Document quality">
            <DocumentOutcomes counters={run.counters} mode={run.mode} />
          </SectionCard>
        </div>
      </Activity>

      <DomainSheet
        run={run}
        domain={search.domain}
        actions={actions}
        readOnly={readOnly}
        onClose={() => setSearch({ domain: undefined })}
      />
    </div>
  )
}

function CancelRunDialog({ onConfirm }: { onConfirm: (note: string | undefined) => void }) {
  const [note, setNote] = useState('')
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Square /> Cancel run
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this run?</DialogTitle>
          <DialogDescription>
            Domains that are still running or queued stop immediately. Documents that were already published stay in the
            library. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="Optional: why are you cancelling? (shown in the activity log)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Keep running</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="destructive" onClick={() => onConfirm(note.trim() === '' ? undefined : note.trim())}>
              Cancel run
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
