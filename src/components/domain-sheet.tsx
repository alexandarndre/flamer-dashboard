import { useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { Building2, Check, ExternalLink, MessageSquarePlus, Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { useRunActions } from '@/lib/actions'
import { ago, clock, dateTime, duration, num, pct } from '@/lib/format'
import { BLOCKER_INFO, STATUS_INFO, availableActions } from '@/shared/catalog'
import { ORG_TYPE_LABEL, orgOf } from '@/shared/geo'
import type { RunDetail } from '@/shared/contract'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ActivityFeed, DocumentOutcomes } from './blocks'
import { NoteDialog, OwnerMenu, RemedyButtons } from './remedies'
import { ProgressBar, StatusBadge } from './status'

const STAGES = [
  { label: 'Map the site', until: 0.3 },
  { label: 'Download PDFs', until: 0.85 },
  { label: 'Validate & dedupe', until: 1 },
]

export function DomainSheet({
  run,
  domain,
  actions,
  readOnly,
  onClose,
}: {
  run: RunDetail
  domain: string | undefined
  actions: ReturnType<typeof useRunActions>
  readOnly: boolean
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const d = run.domains.find((x) => x.domain === domain)
  const org = d === undefined ? null : orgOf(d.domain)
  const events = d === undefined ? [] : run.events.filter((e) => e.domain === d.domain).toReversed()
  const available = d === undefined || readOnly ? [] : availableActions(d.status)

  return (
    <Sheet open={d !== undefined} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        ref={panel}
        className="w-full gap-0 overflow-y-auto outline-none sm:max-w-xl"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          panel.current?.focus()
        }}
      >
        {d !== undefined && (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="flex items-center gap-2 text-lg">
                {d.domain}
                <a
                  href={`https://${d.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Open ${d.domain}`}
                >
                  <ExternalLink className="size-4" />
                </a>
              </SheetTitle>
              <SheetDescription>{run.name}</SheetDescription>
              {org !== null && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <Building2 className="size-3.5 text-muted-foreground" />
                  <span className="font-medium">{org.name ?? 'Unknown organisation'}</span>
                  <span className="text-muted-foreground">
                    {ORG_TYPE_LABEL[org.type]}
                    {org.place !== null &&
                      ` · ${org.place.city === null ? `somewhere in ${org.place.countryName}` : `${org.place.city}, ${org.place.countryName}`}`}
                  </span>
                  <Link
                    to="/explore"
                    search={{ focus: `domain:${d!.domain}` }}
                    className="ml-auto text-xs text-brand hover:underline"
                  >
                    Show connections →
                  </Link>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <StatusBadge status={d.status} />
                <span className="text-sm text-muted-foreground">{STATUS_INFO[d.status].explain}</span>
              </div>
            </SheetHeader>

            <div className="grid gap-6 p-4">
              {d.blocker !== null && (
                <Alert variant="destructive">
                  <AlertTitle>{BLOCKER_INFO[d.blocker].title}</AlertTitle>
                  <AlertDescription className="grid gap-3">
                    <p>{BLOCKER_INFO[d.blocker].explain}</p>
                    {d.ownerDeclined && <p className="font-medium">The publisher declined our request.</p>}
                    {!readOnly && (
                      <RemedyButtons
                        actions={actions}
                        issue={{
                          runId: run.id,
                          domain: d.domain,
                          blocker: d.blocker,
                          since: d.blockedSince ?? run.at,
                          attempt: d.attempt,
                          remedies: d.remedies,
                          ownerDeclined: d.ownerDeclined,
                          progress: d.progress,
                          owner: d.owner,
                          notes: d.notes.length,
                        }}
                      />
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <section className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Owner & notes</h3>
                  {readOnly ? (
                    <span className="text-xs text-muted-foreground">{d.owner ?? 'Unassigned'}</span>
                  ) : (
                    <OwnerMenu runId={run.id} domain={d.domain} owner={d.owner} actions={actions} />
                  )}
                </div>
                {d.notes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No notes yet.</p>
                ) : (
                  <ul className="grid gap-2">
                    {d.notes.toReversed().map((n) => (
                      <li key={`${n.at}${n.actor}`} className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{n.actor}</span> · {ago(n.at, run.at)}
                        </div>
                        <p className="mt-0.5">{n.text}</p>
                      </li>
                    ))}
                  </ul>
                )}
                {!readOnly && (
                  <NoteDialog
                    runId={run.id}
                    domain={d.domain}
                    actions={actions}
                    trigger={
                      <Button size="xs" variant="outline" className="w-fit">
                        <MessageSquarePlus /> Add note
                      </Button>
                    }
                  />
                )}
              </section>

              {d.resumeAt !== null && d.resumeAt > run.at && (
                <p className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm">
                  {d.status === 'backing_off' ? 'Retrying automatically' : 'Expecting the publisher’s reply'} in about{' '}
                  {duration((d.resumeAt - run.at) / 1000)}.
                </p>
              )}

              <section className="grid gap-3">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-medium">Progress</h3>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {pct(d.progress)}
                    {d.etaSec !== null && ` · ~${duration(d.etaSec)} left`}
                  </span>
                </div>
                <ProgressBar
                  value={d.progress}
                  tone={d.status === 'needs_attention' ? 'danger' : d.status === 'completed' ? 'success' : 'info'}
                />
                <ol className="grid grid-cols-3 gap-2 text-xs">
                  {STAGES.map((stage, i) => {
                    const from = i === 0 ? 0 : STAGES[i - 1]!.until
                    const done = d.progress >= stage.until - 1e-9
                    const current = !done && d.progress >= from
                    return (
                      <li
                        key={stage.label}
                        className={cn(
                          'flex items-center gap-1.5 rounded-md border px-2 py-1.5',
                          done && 'border-success/30 text-success',
                          current && d.status !== 'needs_attention' && 'border-info/40 bg-info/5 text-info',
                          current && d.status === 'needs_attention' && 'border-danger/40 bg-danger/5 text-danger',
                          !done && !current && 'text-muted-foreground',
                        )}
                      >
                        {done ? (
                          <Check className="size-3.5" />
                        ) : (
                          <span className="text-[0.7rem] tabular-nums">{i + 1}</span>
                        )}
                        {stage.label}
                      </li>
                    )
                  })}
                </ol>
              </section>

              <section className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                {[
                  ['Pages visited', num(d.counters.pages)],
                  ['PDF links found', num(d.counters.pdfsFound)],
                  ['Downloaded', num(d.counters.downloaded)],
                  ['Processed', num(d.counters.processed)],
                  ['Speed', d.pagesPerMin > 0 ? `${num(d.pagesPerMin)} pages/min` : '–'],
                  ['Attempt', String(d.attempt)],
                  ['Started', d.startedAt === null ? 'Not yet' : clock(d.startedAt)],
                  ['Finished', d.finishedAt === null ? '–' : dateTime(d.finishedAt)],
                ].map(([label, value]) => (
                  <div key={label} className="grid">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="font-medium tabular-nums">{value}</span>
                  </div>
                ))}
              </section>

              <Separator />

              <section className="grid gap-3">
                <h3 className="text-sm font-medium">Documents</h3>
                <DocumentOutcomes counters={d.counters} mode={run.mode} />
              </section>

              <Separator />

              <section className="grid gap-2">
                <h3 className="text-sm font-medium">Timeline</h3>
                <ActivityFeed
                  events={events}
                  now={run.at}
                  empty="Nothing has happened yet: the domain is still queued."
                />
              </section>
            </div>

            {available.some((a) => a !== 'resolve') && (
              <SheetFooter className="sticky bottom-0 flex-row flex-wrap border-t bg-background">
                {available.includes('pause') && (
                  <Button
                    variant="outline"
                    onClick={() => actions.act(run.id, { type: 'pause', domains: [d.domain] }, 'Pausing')}
                  >
                    <Pause /> Pause
                  </Button>
                )}
                {available.includes('resume') && (
                  <Button onClick={() => actions.act(run.id, { type: 'resume', domains: [d.domain] }, 'Resuming')}>
                    <Play /> Resume
                  </Button>
                )}
                {available.includes('retry') && d.status === 'skipped' && (
                  <Button onClick={() => actions.act(run.id, { type: 'retry', domains: [d.domain] }, 'Retrying')}>
                    <RotateCcw /> Crawl again
                  </Button>
                )}
                {available.includes('skip') && d.status !== 'needs_attention' && (
                  <Button
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={() => actions.act(run.id, { type: 'skip', domains: [d.domain] }, 'Skipping')}
                  >
                    <SkipForward /> Skip domain
                  </Button>
                )}
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
