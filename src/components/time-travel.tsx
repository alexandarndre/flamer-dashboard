import { useState } from 'react'
import { History, Radio } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ago, clock, dateTime } from '@/lib/format'
import type { RunAction } from '@/shared/contract'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const ACTION_LABEL: Record<RunAction['type'], string> = {
  pause_run: 'Run paused',
  resume_run: 'Run resumed',
  cancel_run: 'Run cancelled',
  pause: 'Paused',
  resume: 'Resumed',
  retry: 'Retry',
  resolve: 'Unblocked',
  skip: 'Skipped',
  assign: 'Assigned',
  note: 'Note',
}

export function TimeTravel({
  start,
  end,
  value,
  actions,
  onChange,
}: {
  start: number
  end: number
  value: number | undefined
  actions: RunAction[]
  onChange: (at: number | undefined) => void
}) {
  const [drag, setDrag] = useState<number | null>(null)
  const shown = drag ?? value ?? end
  const span = Math.max(1, end - start)
  const position = (t: number) => `${((t - start) / span) * 100}%`

  return (
    <div
      className={cn(
        'grid gap-3 rounded-xl border p-4 transition-colors',
        value !== undefined && 'border-brand/40 bg-brand/5',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <History className="size-4 text-muted-foreground" />
        <span className="font-medium">Replay</span>
        <span className="text-muted-foreground">
          {value === undefined && drag === null
            ? 'Drag to see exactly what the run looked like at any moment.'
            : `${dateTime(shown)} · ${ago(shown, end)}`}
        </span>
        {value !== undefined && (
          <Button size="xs" className="ml-auto" onClick={() => onChange(undefined)}>
            <Radio /> Back to live
          </Button>
        )}
      </div>
      <div className="relative px-1">
        <Slider
          min={start}
          max={end}
          step={5000}
          value={[shown]}
          onValueChange={([v]) => setDrag(v ?? null)}
          onValueCommit={([v]) => {
            setDrag(null)
            onChange(v === undefined || v >= end - 5000 ? undefined : Math.round(v))
          }}
          aria-label="Replay position"
        />
        <div className="pointer-events-none absolute inset-x-1 -top-2 h-2">
          {actions.map((a) => (
            <Tooltip key={a.id}>
              <TooltipTrigger asChild>
                <span
                  className="pointer-events-auto absolute size-2 -translate-x-1/2 rotate-45 rounded-[2px] bg-brand"
                  style={{ left: position(a.at) }}
                />
              </TooltipTrigger>
              <TooltipContent>
                {clock(a.at)} · {ACTION_LABEL[a.type]} by {a.actor}
                {a.domains !== undefined && `: ${a.domains.join(', ')}`}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{clock(start)}</span>
        <span>{value === undefined ? 'now' : clock(end)}</span>
      </div>
    </div>
  )
}
