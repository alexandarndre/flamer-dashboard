import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Clock, MessageSquarePlus, SkipForward, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { pendingKey, type useRunActions } from '@/lib/actions'
import { ago, pct, plural } from '@/lib/format'
import { useOperatorName } from '@/lib/identity'
import { BLOCKER_INFO, REMEDY_INFO, slaOf } from '@/shared/catalog'
import type { Blocker, Remedy } from '@/shared/contract'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BlockerBadge } from './status'

type Actions = ReturnType<typeof useRunActions>

export type IssueLike = {
  runId: string
  runName?: string
  domain: string
  blocker: Blocker
  since: number
  attempt: number
  remedies: Remedy[]
  ownerDeclined: boolean
  progress: number
  owner: string | null
  notes: number
}

export const TEAM = ['Maya R.', 'Daniel K.', 'Priya S.']

export function RemedyButtons({
  issue,
  actions,
  size = 'sm',
}: {
  issue: IssueLike
  actions: Actions
  size?: 'sm' | 'xs'
}) {
  const pending = actions.pending.get(pendingKey(issue.runId, issue.domain))
  if (pending !== undefined)
    return (
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner /> {pending}…
      </span>
    )
  const recommended = BLOCKER_INFO[issue.blocker].recommended
  const ordered = issue.remedies.toSorted((a, b) => Number(b === recommended) - Number(a === recommended))
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ordered.map((remedy) => (
        <Tooltip key={remedy}>
          <TooltipTrigger asChild>
            <Button
              size={size}
              variant={remedy === recommended ? 'default' : 'outline'}
              onClick={() =>
                actions.act(
                  issue.runId,
                  { type: 'resolve', domains: [issue.domain], remedy },
                  REMEDY_INFO[remedy].label,
                  `${issue.domain}: ${REMEDY_INFO[remedy].label}`,
                )
              }
            >
              {REMEDY_INFO[remedy].label}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{REMEDY_INFO[remedy].hint}</TooltipContent>
        </Tooltip>
      ))}
      <Button
        size={size}
        variant="ghost"
        className="text-muted-foreground"
        onClick={() =>
          actions.act(issue.runId, { type: 'skip', domains: [issue.domain] }, 'Skipping', `${issue.domain} skipped`)
        }
      >
        <SkipForward /> Skip domain
      </Button>
    </div>
  )
}

export function OwnerMenu({
  runId,
  domain,
  owner,
  actions,
  people = [],
}: {
  runId: string
  domain: string
  owner: string | null
  actions: Actions
  people?: string[]
}) {
  const me = useOperatorName()
  const [custom, setCustom] = useState<string | null>(null)
  const assign = (assignee: string | null) =>
    actions.act(
      runId,
      { type: 'assign', domains: [domain], assignee },
      assignee === null ? 'Unassigning' : 'Assigning',
      assignee === null ? `${domain} unassigned` : `${domain} → ${assignee}`,
    )
  const others = [...new Set([...TEAM, ...people])].filter((p) => p !== me && p !== owner && p !== 'You')
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs hover:bg-muted',
              owner === null ? 'border-dashed text-muted-foreground' : 'font-medium',
            )}
          >
            <UserRound className="size-3" />
            {owner ?? 'Unassigned'}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Who owns {domain}?</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {owner !== me && <DropdownMenuItem onSelect={() => assign(me)}>Assign to me ({me})</DropdownMenuItem>}
          {others.map((p) => (
            <DropdownMenuItem key={p} onSelect={() => assign(p)}>
              {p}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => setCustom('')}>Someone else…</DropdownMenuItem>
          {owner !== null && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => assign(null)}>Unassign</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={custom !== null} onOpenChange={(open) => !open && setCustom(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign {domain}</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (custom !== null && custom.trim() !== '') assign(custom.trim())
              setCustom(null)
            }}
          >
            <Input
              autoFocus
              placeholder="Name"
              maxLength={40}
              value={custom ?? ''}
              onChange={(e) => setCustom(e.target.value)}
              aria-label="Assignee"
            />
            <Button type="submit">Assign</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function NoteDialog({
  runId,
  domain,
  actions,
  trigger,
}: {
  runId: string
  domain: string
  actions: Actions
  trigger: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Note on {domain}</DialogTitle>
          <DialogDescription>Visible to everyone in the domain’s timeline and the activity log.</DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          maxLength={280}
          placeholder="e.g. Emailed their webmaster, waiting for an answer"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <DialogFooter>
          <Button
            disabled={text.trim() === ''}
            onClick={() => {
              actions.act(runId, { type: 'note', domains: [domain], note: text.trim() }, 'Saving note', 'Note added')
              setText('')
              setOpen(false)
            }}
          >
            Add note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AgeBadge({ since, now }: { since: number; now: number }) {
  const sla = slaOf(since, now)
  if (sla === 'fresh') return null
  return (
    <Badge
      variant="ghost"
      className={cn(sla === 'overdue' ? 'bg-danger/12 text-danger' : 'bg-warn/14 text-warn', 'h-5 px-1.5 text-[11px]')}
    >
      {sla === 'overdue' ? 'Overdue' : 'Aging'}
    </Badge>
  )
}

export function IssueRow({
  issue,
  actions,
  now,
  showRun = false,
  people,
  className,
}: {
  issue: IssueLike
  actions: Actions
  now: number
  showRun?: boolean
  people?: string[]
  className?: string
}) {
  return (
    <div className={cn('grid gap-3 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center', className)}>
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/runs/$runId"
            params={{ runId: issue.runId }}
            search={{ domain: issue.domain }}
            className="font-medium hover:underline"
          >
            {issue.domain}
          </Link>
          <BlockerBadge blocker={issue.blocker} />
          <AgeBadge since={issue.since} now={now} />
          {issue.ownerDeclined && <span className="text-xs text-danger">Publisher declined</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <OwnerMenu runId={issue.runId} domain={issue.domain} owner={issue.owner} actions={actions} people={people} />
          <span className="flex items-center gap-1">
            <Clock className="size-3" /> blocked {ago(issue.since, now)}
          </span>
          <span>{pct(issue.progress)} crawled before the block</span>
          {issue.attempt > 1 && <span>attempt {issue.attempt}</span>}
          <NoteDialog
            runId={issue.runId}
            domain={issue.domain}
            actions={actions}
            trigger={
              <button type="button" className="inline-flex items-center gap-1 hover:text-foreground">
                <MessageSquarePlus className="size-3" />
                {issue.notes > 0 ? plural(issue.notes, 'note') : 'Add note'}
              </button>
            }
          />
          {showRun && issue.runName !== undefined && (
            <Link to="/runs/$runId" params={{ runId: issue.runId }} className="truncate hover:underline">
              {issue.runName}
            </Link>
          )}
        </div>
      </div>
      <RemedyButtons issue={issue} actions={actions} />
    </div>
  )
}
