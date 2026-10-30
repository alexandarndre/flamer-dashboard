import { Link } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowRight, Copy, FileCheck2, FileX2, Gauge, Hand, Radar } from 'lucide-react'
import { useRunActions } from '@/lib/actions'
import { queries } from '@/lib/api'
import { ago, duration, num, pct, plural, short } from '@/lib/format'
import { BLOCKER_INFO, RUN_STATUS_INFO } from '@/shared/catalog'
import type { Blocker, RunSummary } from '@/shared/contract'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ActivityFeed, DocumentOutcomes, Funnel, Kpi, PageHeader, SectionCard } from '@/components/blocks'
import { IssueRow } from '@/components/remedies'
import { RunStatusBadge, StatusBar } from '@/components/status'
import { ThroughputChart } from '@/components/throughput-chart'

export function OverviewPage() {
  const { data } = useSuspenseQuery(queries.overview())
  const actions = useRunActions()
  const active = data.runs.filter((r) => r.status !== 'completed' && r.status !== 'cancelled')
  const byBlocker = Object.entries(Object.groupBy(data.issues, (i) => i.blocker)) as [Blocker, typeof data.issues][]
  const documents = data.totals.published + data.totals.updated

  return (
    <div className="mx-auto grid max-w-7xl gap-6">
      <PageHeader
        title="Crawl operations"
        description={`${active.length} runs in progress · ${num(data.statusCounts.discovering + data.statusCounts.downloading + data.statusCounts.processing)} domains crawling right now`}
      />

      {data.issues.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-danger/30 bg-danger/5 p-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-danger/15 text-danger">
            <Hand className="size-5" />
          </div>
          <div className="grid flex-1 gap-0.5">
            <div className="font-medium">
              {data.issues.length} {data.issues.length === 1 ? 'domain is' : 'domains are'} blocked and waiting for you
            </div>
            <div className="text-sm text-muted-foreground">
              {byBlocker.map(([b, list]) => `${list.length} × ${BLOCKER_INFO[b].title.toLowerCase()}`).join(' · ')}
              {' · oldest blocked '}
              {ago(data.issues[0]!.since, data.at)}
            </div>
          </div>
          <Button asChild>
            <Link to="/issues">
              Review all <ArrowRight />
            </Link>
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi
          label="Crawl speed"
          icon={<Gauge />}
          value={`${short(data.pagesPerMin)}/min`}
          hint={
            data.statusCounts.backing_off > 0
              ? `${plural(data.statusCounts.backing_off, 'site')} slowing us down`
              : 'No site is slowing us down'
          }
          help="Pages and files fetched per minute across every active run."
        />
        <Kpi
          label="Documents published"
          icon={<FileCheck2 />}
          tone="success"
          value={short(documents)}
          hint={`${num(data.totals.updated)} of them updated versions`}
          help="New or updated records that reached the library."
        />
        <Kpi
          label="Duplicates avoided"
          icon={<Copy />}
          value={short(data.totals.duplicates)}
          hint={`${pct(data.totals.duplicates / Math.max(1, data.totals.processed))} of processed PDFs`}
          help="PDFs we already had (same file, DOI or text) so they were not published twice."
        />
        <Kpi
          label="Rejected"
          icon={<FileX2 />}
          value={short(data.totals.rejected)}
          hint="Failed quality checks"
          help="Encrypted, damaged, scanned-only or not real reports."
        />
        <Kpi
          label="Needs you"
          icon={<Hand />}
          tone={data.attention > 0 ? 'danger' : 'success'}
          value={data.attention}
          hint={data.attention > 0 ? 'domains blocked' : 'All clear'}
          help="Domains the crawler cannot get past without a human decision."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ThroughputChart points={data.throughput} title="Crawl speed, last hour" />
        <SectionCard
          title="Pipeline"
          description="From pages visited to documents in the library"
          className="lg:col-span-1"
        >
          <Funnel counters={data.totals} />
        </SectionCard>
        <SectionCard title="Document quality" description="What happened to every processed PDF">
          <DocumentOutcomes counters={data.totals} />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <SectionCard
          title="Runs"
          description="Every crawl run and where it stands"
          className="lg:col-span-3"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/runs">
                All runs <ArrowRight />
              </Link>
            </Button>
          }
          contentClassName="grid gap-2"
        >
          {data.runs.slice(0, 6).map((run) => (
            <RunLine key={run.id} run={run} now={data.at} />
          ))}
        </SectionCard>
        <SectionCard title="Live activity" description="Latest events across all runs" className="lg:col-span-2">
          <ScrollArea className="h-[22rem] pr-3">
            <ActivityFeed events={data.events.slice(0, 40)} showRun now={data.at} />
          </ScrollArea>
        </SectionCard>
      </div>

      {data.issues.length > 0 && (
        <SectionCard
          title="Oldest blocks first"
          description="Unblock these to keep runs moving"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/issues">
                Open inbox <ArrowRight />
              </Link>
            </Button>
          }
          contentClassName="divide-y"
        >
          {data.issues.slice(0, 4).map((issue) => (
            <IssueRow key={`${issue.runId}:${issue.domain}`} issue={issue} actions={actions} now={data.at} showRun />
          ))}
        </SectionCard>
      )}
    </div>
  )
}

function RunLine({ run, now }: { run: RunSummary; now: number }) {
  return (
    <Link
      to="/runs/$runId"
      params={{ runId: run.id }}
      className="grid gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/40"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Radar className="size-4 text-muted-foreground" />
        <span className="font-medium">{run.name}</span>
        <RunStatusBadge status={run.status} />
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {run.status === 'running' && run.etaSec !== null
            ? `~${duration(run.etaSec)} left`
            : run.finishedAt !== null
              ? `${RUN_STATUS_INFO[run.status].label} ${ago(run.finishedAt, now)}`
              : `started ${ago(run.createdAt, now)}`}
        </span>
      </div>
      <StatusBar counts={run.statusCounts} />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
        <span>{pct(run.progress)} complete</span>
        <span>{run.domainCount} domains</span>
        <span>{num(run.counters.published + run.counters.updated)} documents</span>
        {run.attention > 0 && <span className="text-danger">{run.attention} need you</span>}
      </div>
    </Link>
  )
}
