import { cn } from '@/lib/utils'
import { BLOCKER_INFO, RUN_STATUS_INFO, STATUS_INFO, type Tone } from '@/shared/catalog'
import type { Blocker, DomainStatus, RunStatus } from '@/shared/contract'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export const TONE_TEXT: Record<Tone, string> = {
  muted: 'text-muted-foreground',
  info: 'text-info',
  warn: 'text-warn',
  danger: 'text-danger',
  success: 'text-success',
}

export const TONE_BG: Record<Tone, string> = {
  muted: 'bg-idle',
  info: 'bg-info',
  warn: 'bg-warn',
  danger: 'bg-danger',
  success: 'bg-success',
}

const TONE_BADGE: Record<Tone, string> = {
  muted: 'bg-muted text-muted-foreground',
  info: 'bg-info/12 text-info',
  warn: 'bg-warn/14 text-warn',
  danger: 'bg-danger/12 text-danger',
  success: 'bg-success/12 text-success',
}

const PULSING: readonly string[] = ['discovering', 'downloading', 'processing', 'backing_off', 'running']

export function Dot({ tone, pulse = false, className }: { tone: Tone; pulse?: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex size-2 shrink-0', className)} aria-hidden>
      {pulse && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', TONE_BG[tone])} />}
      <span className={cn('relative inline-flex size-2 rounded-full', TONE_BG[tone])} />
    </span>
  )
}

export function StatusBadge({ status, className }: { status: DomainStatus; className?: string }) {
  const info = STATUS_INFO[status]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="ghost" className={cn('gap-1.5 font-medium', TONE_BADGE[info.tone], className)}>
          <Dot tone={info.tone} pulse={PULSING.includes(status)} />
          {info.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{info.explain}</TooltipContent>
    </Tooltip>
  )
}

export function RunStatusBadge({ status, className }: { status: RunStatus; className?: string }) {
  const info = RUN_STATUS_INFO[status]
  return (
    <Badge variant="ghost" className={cn('gap-1.5 font-medium', TONE_BADGE[info.tone], className)}>
      <Dot tone={info.tone} pulse={PULSING.includes(status)} />
      {info.label}
    </Badge>
  )
}

export function BlockerBadge({ blocker, className }: { blocker: Blocker; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={cn('border-danger/30 font-medium text-danger', className)}>
          {BLOCKER_INFO[blocker].title}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{BLOCKER_INFO[blocker].explain}</TooltipContent>
    </Tooltip>
  )
}

const SEGMENTS: { statuses: DomainStatus[]; tone: Tone; label: string }[] = [
  { statuses: ['completed'], tone: 'success', label: 'Done' },
  { statuses: ['discovering', 'downloading', 'processing'], tone: 'info', label: 'Crawling' },
  { statuses: ['backing_off', 'waiting_owner'], tone: 'warn', label: 'Retrying / waiting' },
  { statuses: ['needs_attention'], tone: 'danger', label: 'Needs you' },
  { statuses: ['queued', 'paused', 'skipped', 'cancelled'], tone: 'muted', label: 'Queued / stopped' },
]

export function StatusBar({ counts, className }: { counts: Record<DomainStatus, number>; className?: string }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const parts = SEGMENTS.map((s) => ({ ...s, n: s.statuses.reduce((a, k) => a + counts[k], 0) })).filter((s) => s.n > 0)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn('flex h-2 w-full overflow-hidden rounded-full bg-muted', className)}
          role="img"
          aria-label="Domain status breakdown"
        >
          {parts.map((p) => (
            <div
              key={p.label}
              className={cn(
                'h-full transition-[width] duration-700 not-last:border-r-2 not-last:border-background',
                TONE_BG[p.tone],
              )}
              style={{ width: `${(p.n / Math.max(1, total)) * 100}%` }}
            />
          ))}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <ul className="grid gap-1">
          {parts.map((p) => (
            <li key={p.label} className="flex items-center gap-2">
              <Dot tone={p.tone} />
              <span className="flex-1">{p.label}</span>
              <span className="tabular-nums">{p.n}</span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}

export function ProgressBar({ value, tone = 'info', className }: { value: number; tone?: Tone; className?: string }) {
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-700', TONE_BG[tone])}
        style={{ width: `${value * 100}%` }}
      />
    </div>
  )
}
