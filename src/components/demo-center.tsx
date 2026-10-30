import { useEffect, useState, useSyncExternalStore } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, FlaskConical, Map as MapIcon, RotateCcw, UserRound, X } from 'lucide-react'
import { api, queries } from '@/lib/api'
import { transport } from '@/lib/backend'
import { clock } from '@/lib/format'
import { setOperatorName, useOperatorName } from '@/lib/identity'
import { DEMO_SPEEDS, type DemoSpeed } from '@/shared/contract'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const SEEN_KEY = 'flamer-tour-seen'

type Step = {
  title: string
  body: string
  to: '/' | '/issues' | '/runs/$runId' | '/explore' | '/runs/new'
  runId?: string
}

const STEPS: Step[] = [
  {
    title: 'Everything at a glance',
    body: 'Crawl speed, documents published, duplicates avoided and what is blocked, across every run. It updates live.',
    to: '/',
  },
  {
    title: 'Unblock without an engineer',
    body: 'Blocked domains are grouped by cause and explained in plain language, with the recommended fix first. Assign them to someone and leave notes.',
    to: '/issues',
  },
  {
    title: 'Drill into a run',
    body: 'Every domain with its stage, speed and documents. Open one for its timeline, or drag the Replay slider to see the run at any past moment.',
    to: '/runs/$runId',
    runId: 'run_igo_weekly',
  },
  {
    title: 'Where sources are and how they connect',
    body: 'A world map of publishers and a relationship graph of runs, domains, blockers and countries. Click anything to focus on it.',
    to: '/explore',
  },
  {
    title: 'Start your own crawl',
    body: 'Paste or upload domains; the list is cleaned and checked before you start. Tip: set the demo clock to 60× to watch it finish in a minute.',
    to: '/runs/new',
  },
]

let tourStep: number | null = null
const tourListeners = new Set<() => void>()
const setTour = (step: number | null) => {
  tourStep = step
  for (const l of tourListeners) l()
}
const useTourStep = () =>
  useSyncExternalStore(
    (l) => {
      tourListeners.add(l)
      return () => tourListeners.delete(l)
    },
    () => tourStep,
  )

const seen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) !== null
  } catch {
    return true
  }
}

const markSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    return
  }
}

export function DemoCenter() {
  const queryClient = useQueryClient()
  const { data: demo } = useQuery(queries.demo())
  const [open, setOpen] = useState(() => !seen())
  const [confirmReset, setConfirmReset] = useState(false)
  const [busy, setBusy] = useState(false)

  const close = (next: boolean) => {
    setOpen(next)
    setConfirmReset(false)
    if (!next) markSeen()
  }

  const changeSpeed = async (speed: DemoSpeed) => {
    setBusy(true)
    try {
      queryClient.setQueryData(queries.demo().queryKey, await api.setSpeed(speed))
      await queryClient.invalidateQueries()
      toast.success(speed === 1 ? 'Demo clock back to real time' : `Demo clock running ${speed}× faster`)
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    if (!confirmReset) return setConfirmReset(true)
    setBusy(true)
    try {
      await api.reset()
      await queryClient.invalidateQueries()
      toast.success('Demo data reset')
      close(false)
    } finally {
      setBusy(false)
      setConfirmReset(false)
    }
  }

  const where =
    transport() !== 'network'
      ? 'Your data lives in this browser only (IndexedDB), so nobody else sees your changes.'
      : demo !== undefined && demo.sandbox !== null
        ? 'You have a private sandbox: your runs and actions are invisible to other visitors, and it is kept for 14 days.'
        : 'Everyone using this deployment shares one dataset.'

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <FlaskConical />
        <span className="hidden md:inline">Demo</span>
        {demo !== undefined && demo.speed > 1 && (
          <Badge className="h-4 bg-brand px-1 text-[10px] text-white">{demo.speed}×</Badge>
        )}
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Welcome to the Flamer demo</DialogTitle>
            <DialogDescription>
              A control room for the content-operations team: start crawls, watch them live, and unblock the domains the
              crawler cannot get past on its own.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 text-sm">
            <section className="grid gap-1.5">
              <h3 className="font-medium">What is real, what is simulated</h3>
              <p className="text-muted-foreground">
                The API, storage and every action you take are real. The crawl itself is simulated: no request is ever
                sent to these websites. Progress, documents, blocks and publisher replies are computed from each domain,
                the run and the clock, so they are realistic and repeatable.
              </p>
            </section>
            <section className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium">Demo clock</h3>
                {demo !== undefined && (
                  <span className="text-xs text-muted-foreground tabular-nums">demo time {clock(demo.now)}</span>
                )}
              </div>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={String(demo?.speed ?? 1)}
                disabled={busy}
                onValueChange={(v) => v !== '' && void changeSpeed(Number(v) as DemoSpeed)}
                className="w-full"
              >
                {DEMO_SPEEDS.map((s) => (
                  <ToggleGroupItem key={s} value={String(s)} className="flex-1">
                    {s === 1 ? 'Real time' : `${s}× faster`}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">
                Runs normally take 10–30 minutes. At 60× a whole run finishes in under a minute.
              </p>
            </section>
            <section className="grid gap-1.5">
              <h3 className="font-medium">Your data</h3>
              <p className="text-muted-foreground">{where}</p>
            </section>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant={confirmReset ? 'destructive' : 'ghost'} disabled={busy} onClick={() => void reset()}>
              <RotateCcw /> {confirmReset ? 'Click again to wipe and re-seed' : 'Reset demo data'}
            </Button>
            <Button
              onClick={() => {
                close(false)
                setTour(0)
              }}
            >
              <MapIcon /> Take the 1-minute tour
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function Tour() {
  const step = useTourStep()
  const navigate = useNavigate()

  useEffect(() => {
    if (step === null) return
    const s = STEPS[step]!
    if (s.to === '/runs/$runId') void navigate({ to: s.to, params: { runId: s.runId! } })
    else void navigate({ to: s.to })
  }, [step, navigate])

  if (step === null) return null
  const s = STEPS[step]!
  return (
    <div
      role="dialog"
      aria-label="Guided tour"
      className="fixed bottom-4 left-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border bg-popover p-4 text-sm shadow-xl"
    >
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Tour · {step + 1} of {STEPS.length}
        </span>
        <button type="button" aria-label="Close tour" onClick={() => setTour(null)} className="hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
      <div className="font-medium">{s.title}</div>
      <p className="mt-1 text-muted-foreground">{s.body}</p>
      <div className="mt-3 flex justify-between">
        <Button size="sm" variant="ghost" disabled={step === 0} onClick={() => setTour(step - 1)}>
          <ArrowLeft /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button size="sm" onClick={() => setTour(step + 1)}>
            Next <ArrowRight />
          </Button>
        ) : (
          <Button size="sm" onClick={() => setTour(null)}>
            Done
          </Button>
        )}
      </div>
    </div>
  )
}

export function OperatorMenu() {
  const name = useOperatorName()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Signed in as ${name}`}>
            <span className="flex size-7 items-center justify-center rounded-full bg-muted text-[11px] font-semibold uppercase">
              {name === 'You' ? <UserRound className="size-4" /> : name.slice(0, 2)}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Acting as {name}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setDraft(name)
              setEditing(true)
            }}
          >
            Change name…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Your name</DialogTitle>
            <DialogDescription>Shown on your actions, notes and assignments in the activity log.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setOperatorName(draft)
              setEditing(false)
            }}
            className="grid gap-3"
          >
            <Input
              autoFocus
              value={draft}
              maxLength={40}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Name"
            />
            <Button type="submit">Save</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
