import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { CircleAlert, CircleCheck, Info, TriangleAlert, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ago, clock, num, pct, short } from '@/lib/format'
import { REJECT_INFO } from '@/shared/catalog'
import { REJECT_REASONS, type Counters, type CrawlEvent, type EventLevel, type RunMode } from '@/shared/contract'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-1">
        {children}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description !== undefined && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions !== undefined && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Kpi({
  label,
  value,
  hint,
  icon,
  tone,
  help,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  tone?: 'danger' | 'success' | 'info'
  help?: string
}) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardDescription className="flex items-center gap-1.5">
          {help === undefined ? (
            label
          ) : (
            <Tooltip>
              <TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-4">
                {label}
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{help}</TooltipContent>
            </Tooltip>
          )}
        </CardDescription>
        {icon !== undefined && <CardAction className="text-muted-foreground [&_svg]:size-4">{icon}</CardAction>}
      </CardHeader>
      <CardContent className="px-4">
        <div
          className={cn(
            'text-2xl font-semibold tracking-tight tabular-nums',
            tone === 'danger' && 'text-danger',
            tone === 'success' && 'text-success',
            tone === 'info' && 'text-info',
          )}
        >
          {value}
        </div>
        {hint !== undefined && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  )
}

const LEVEL_ICON: Record<EventLevel, ReactNode> = {
  info: <Info className="size-3.5 text-info" />,
  success: <CircleCheck className="size-3.5 text-success" />,
  warn: <TriangleAlert className="size-3.5 text-warn" />,
  error: <CircleAlert className="size-3.5 text-danger" />,
  action: <UserRound className="size-3.5 text-brand" />,
}

export function ActivityFeed({
  events,
  showRun = false,
  now,
  empty = 'No activity yet.',
  className,
}: {
  events: CrawlEvent[]
  showRun?: boolean
  now: number
  empty?: string
  className?: string
}) {
  if (events.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <ol className={cn('relative grid gap-0.5', className)}>
      {events.map((e) => (
        <li
          key={`${e.at}|${e.runId}|${e.domain ?? ''}|${e.message}`}
          className="flex gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
        >
          <div className="mt-0.5">{LEVEL_ICON[e.level]}</div>
          <div className="grid min-w-0 flex-1 gap-0.5">
            <div className="text-sm leading-snug">
              {e.domain !== undefined && (
                <Link
                  to="/runs/$runId"
                  params={{ runId: e.runId }}
                  search={{ domain: e.domain }}
                  className="mr-1.5 font-medium hover:underline"
                >
                  {e.domain}
                </Link>
              )}
              <span className="text-muted-foreground">{e.message}</span>
            </div>
            <div className="flex gap-2 text-xs text-muted-foreground/80">
              <Tooltip>
                <TooltipTrigger className="tabular-nums">{ago(e.at, now)}</TooltipTrigger>
                <TooltipContent>{clock(e.at)}</TooltipContent>
              </Tooltip>
              {showRun && (
                <Link to="/runs/$runId" params={{ runId: e.runId }} className="truncate hover:underline">
                  {e.runName}
                </Link>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

export function DocumentOutcomes({ counters, mode }: { counters: Counters; mode?: RunMode }) {
  const valid = counters.processed - counters.rejected
  const parts = [
    { key: 'new', label: 'New documents published', value: counters.published, className: 'bg-chart-2' },
    { key: 'upd', label: 'Updated versions', value: counters.updated, className: 'bg-chart-3' },
    {
      key: 'dup',
      label: mode === 'recrawl' ? 'Unchanged / already in library' : 'Duplicates of library items',
      value: counters.duplicates,
      className: 'bg-chart-4',
    },
    { key: 'rej', label: 'Rejected by quality checks', value: counters.rejected, className: 'bg-chart-5' },
  ].filter((p) => p.value > 0 || p.key !== 'upd')
  const maxReason = Math.max(1, ...REJECT_REASONS.map((r) => counters.rejectReasons[r]))
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <div className="flex h-3 overflow-hidden rounded-full bg-muted">
          {parts.map((p) => (
            <div
              key={p.key}
              className={cn(
                'h-full transition-[width] duration-700 not-last:border-r-2 not-last:border-card',
                p.className,
              )}
              style={{ width: `${(p.value / Math.max(1, counters.processed)) * 100}%` }}
            />
          ))}
        </div>
        <ul className="grid gap-1.5 text-sm">
          {parts.map((p) => (
            <li key={p.key} className="flex items-center gap-2">
              <span className={cn('size-2.5 rounded-sm', p.className)} />
              <span className="flex-1 text-muted-foreground">{p.label}</span>
              <span className="font-medium tabular-nums">{num(p.value)}</span>
              <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                {counters.processed > 0 ? pct(p.value / counters.processed) : '–'}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-2">
        <div className="text-xs font-medium text-muted-foreground">Why documents were rejected</div>
        {counters.rejected === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing rejected yet.</p>
        ) : (
          <ul className="grid gap-1.5">
            {REJECT_REASONS.toSorted((a, b) => counters.rejectReasons[b] - counters.rejectReasons[a]).map((r) => (
              <li key={r} className="grid grid-cols-[minmax(0,1fr)_6rem_3rem] items-center gap-3 text-sm">
                <span className="truncate text-muted-foreground">{REJECT_INFO[r]}</span>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-chart-5/70 transition-[width] duration-700"
                    style={{ width: `${(counters.rejectReasons[r] / maxReason) * 100}%` }}
                  />
                </div>
                <span className="text-right tabular-nums">{num(counters.rejectReasons[r])}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {num(valid)} of {num(counters.processed)} processed PDFs passed validation.
      </p>
    </div>
  )
}

export function Funnel({ counters }: { counters: Counters }) {
  const steps = [
    { label: 'Pages visited', value: counters.pages, hint: 'HTML pages and sitemaps the crawler read' },
    { label: 'PDF links found', value: counters.pdfsFound, hint: 'Links that point to PDF documents' },
    { label: 'PDFs downloaded', value: counters.downloaded, hint: 'Saved to object storage' },
    { label: 'Processed', value: counters.processed, hint: 'Validated, text extracted, checked for duplicates' },
    {
      label: 'Published',
      value: counters.published + counters.updated,
      hint: 'New or updated records in the library',
    },
  ]
  const max = Math.max(1, counters.pdfsFound)
  return (
    <ol className="grid gap-3">
      {steps.map((s, i) => (
        <li key={s.label} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <Tooltip>
              <TooltipTrigger className="cursor-help text-muted-foreground">{s.label}</TooltipTrigger>
              <TooltipContent>{s.hint}</TooltipContent>
            </Tooltip>
            <span className="font-medium tabular-nums">
              {i === 0 ? short(s.value) : num(s.value)}
              {i > 1 && steps[i - 1]!.value > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {pct(s.value / steps[i - 1]!.value)}
                </span>
              )}
            </span>
          </div>
          {i > 0 && (
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-700"
                style={{ width: `${(s.value / max) * 100}%`, opacity: 1 - i * 0.12 }}
              />
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description !== undefined && <CardDescription>{description}</CardDescription>}
        {action !== undefined && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  )
}
