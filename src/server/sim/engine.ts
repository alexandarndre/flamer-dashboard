import { ACTIVE_STATUSES, BLOCKER_INFO, REMEDY_INFO, TERMINAL_STATUSES, availableActions } from '../../shared/catalog'
import {
  DOMAIN_STATUSES,
  OWNER_REMEDIES,
  type Blocker,
  type CrawlEvent,
  type DomainSnapshot,
  type DomainStatus,
  type EventLevel,
  type Note,
  type Remedy,
  type RunAction,
  type RunDetail,
  type RunRecord,
  type RunStatus,
  type StatusCounts,
  type ThroughputPoint,
} from '../../shared/contract'
import {
  DOWNLOAD_END,
  MAP_END,
  OWNER_APPROVAL,
  addCounters,
  countersAt,
  emptyCounters,
  planAttempt,
  profileOf,
  type AttemptPlan,
  type DomainProfile,
} from './profile'
import { hash32, rng } from './rng'

export const WINDOW_MIN = 60
const MINUTE = 60_000
const EPS = 1e-9

type DomainState = {
  domain: string
  profile: DomainProfile
  status: DomainStatus
  p: number
  attempt: number
  plan: AttemptPlan
  episodeIdx: number
  resumeAt: number | null
  blocker: Blocker | null
  lastBlocker: Blocker | null
  blockedSince: number | null
  ownerDeclined: boolean
  ownerApproves: boolean
  slowed: boolean
  entryPointAdded: boolean
  heldByRun: boolean
  queueSeq: number
  startedAt: number | null
  finishedAt: number | null
  lastEvent: CrawlEvent | null
  owner: string | null
  notes: Note[]
}

const isActive = (s: DomainStatus) => ACTIVE_STATUSES.includes(s)
const isTerminal = (s: DomainStatus) => TERMINAL_STATUSES.includes(s)
const stageOf = (p: number): DomainStatus =>
  p < MAP_END ? 'discovering' : p < DOWNLOAD_END ? 'downloading' : 'processing'
const fmt = (n: number) => n.toLocaleString('en-US')

export function emptyStatusCounts(): StatusCounts {
  return Object.fromEntries(DOMAIN_STATUSES.map((s) => [s, 0])) as StatusCounts
}

export function simulateRun(record: RunRecord, at: number): RunDetail {
  const { spec } = record
  const actions = record.actions.filter((a) => a.at <= at).toSorted((a, b) => a.at - b.at)
  const events: CrawlEvent[] = []
  const buckets = new Map<number, ThroughputPoint>()
  const windowStart = Math.floor(at / MINUTE) * MINUTE - (WINDOW_MIN - 1) * MINUTE

  let seq = 0
  let runPaused = false
  let cancelledAt: number | null = null

  const emit = (t: number, level: EventLevel, message: string, ds?: DomainState) => {
    const event: CrawlEvent = { at: t, runId: spec.id, runName: spec.name, level, message }
    if (ds !== undefined) {
      event.domain = ds.domain
      ds.lastEvent = event
    }
    events.push(event)
  }

  const states: DomainState[] = spec.domains.map((domain) => {
    const profile = profileOf(domain)
    return {
      domain,
      profile,
      status: 'queued',
      p: 0,
      attempt: 1,
      plan: planAttempt({
        domain,
        seed: spec.seed,
        attempt: 1,
        startP: 0,
        settings: spec.settings,
        profile,
        slowed: false,
        previous: null,
        remedy: null,
        approved: false,
      }),
      episodeIdx: 0,
      resumeAt: null,
      blocker: null,
      lastBlocker: null,
      blockedSince: null,
      ownerDeclined: false,
      ownerApproves: false,
      slowed: false,
      entryPointAdded: false,
      heldByRun: false,
      queueSeq: seq++,
      startedAt: null,
      finishedAt: null,
      lastEvent: null,
      owner: null,
      notes: [],
    }
  })
  const byDomain = new Map(states.map((s) => [s.domain, s]))

  emit(spec.createdAt, 'action', `${spec.createdBy} started “${spec.name}” with ${spec.domains.length} domains`)

  const requeue = (ds: DomainState, remedy: Remedy | null, approved: boolean) => {
    ds.attempt += 1
    if (remedy === 'slow_down') ds.slowed = true
    if (remedy === 'add_entry_point') {
      ds.entryPointAdded = true
      ds.p = Math.min(ds.p, 0.12)
    }
    ds.plan = planAttempt({
      domain: ds.domain,
      seed: spec.seed,
      attempt: ds.attempt,
      startP: ds.p,
      settings: spec.settings,
      profile: ds.profile,
      slowed: ds.slowed,
      previous: ds.lastBlocker,
      remedy,
      approved,
    })
    ds.episodeIdx = 0
    ds.blocker = null
    ds.blockedSince = null
    ds.resumeAt = null
    ds.finishedAt = null
    ds.status = 'queued'
    ds.queueSeq = seq++
  }

  const fillSlots = (t: number) => {
    if (runPaused || cancelledAt !== null) return
    let free = spec.settings.concurrency - states.filter((s) => isActive(s.status)).length
    if (free <= 0) return
    const queue = states.filter((s) => s.status === 'queued').toSorted((a, b) => a.queueSeq - b.queueSeq)
    for (const ds of queue) {
      if (free-- <= 0) break
      ds.status = stageOf(ds.p)
      ds.startedAt ??= t
      emit(
        t,
        'info',
        ds.attempt === 1 && ds.p === 0 ? 'Started mapping the site' : `Resumed crawling (attempt ${ds.attempt})`,
        ds,
      )
    }
  }

  const nextMilestone = (ds: DomainState): number => {
    const targets = [1]
    if (ds.plan.failAt !== null) targets.push(ds.plan.failAt)
    const episode = ds.plan.episodes[ds.episodeIdx]
    if (episode !== undefined) targets.push(episode.at)
    if (ds.p < MAP_END) targets.push(MAP_END)
    else if (ds.p < DOWNLOAD_END) targets.push(DOWNLOAD_END)
    const target = Math.min(...targets.filter((x) => x > ds.p + EPS))
    return Number.isFinite(target) ? target : ds.p
  }

  const recordThroughput = (ds: DomainState, p0: number, p1: number, t0: number, t1: number) => {
    if (t1 <= windowStart) return
    let a = Math.max(t0, windowStart)
    const pa = p0 + ((p1 - p0) * (a - t0)) / (t1 - t0)
    let ca = countersAt(ds.profile, spec.mode, pa, ds.entryPointAdded)
    while (a < t1) {
      const bucket = Math.floor(a / MINUTE) * MINUTE
      const b = Math.min(t1, bucket + MINUTE)
      const pb = p0 + ((p1 - p0) * (b - t0)) / (t1 - t0)
      const cb = countersAt(ds.profile, spec.mode, pb, ds.entryPointAdded)
      const point = buckets.get(bucket) ?? { t: bucket, pages: 0, published: 0 }
      point.pages += cb.pages - ca.pages + (cb.downloaded - ca.downloaded)
      point.published += cb.published + cb.updated - (ca.published + ca.updated)
      buckets.set(bucket, point)
      a = b
      ca = cb
    }
  }

  const advance = (t0: number, t1: number) => {
    if (t1 <= t0) return
    for (const ds of states) {
      if (!isActive(ds.status) || ds.status === 'backing_off') continue
      const p0 = ds.p
      const p1 = Math.min(nextMilestone(ds), p0 + (t1 - t0) / 1000 / ds.plan.durationSec)
      ds.p = p1
      recordThroughput(ds, p0, p1, t0, t1)
    }
  }

  const settle = (t: number) => {
    for (const ds of states) {
      if (ds.status === 'backing_off' && ds.resumeAt !== null && ds.resumeAt <= t + EPS) {
        ds.status = stageOf(ds.p)
        ds.resumeAt = null
        emit(t, 'info', 'Site is responding again, continuing', ds)
        continue
      }
      if (ds.status === 'waiting_owner' && ds.resumeAt !== null && ds.resumeAt <= t + EPS) {
        if (ds.ownerApproves) {
          emit(t, 'success', 'Publisher approved our request, queued again', ds)
          requeue(ds, null, true)
        } else {
          ds.status = 'needs_attention'
          ds.ownerDeclined = true
          ds.blocker = ds.lastBlocker
          ds.blockedSince = t
          ds.resumeAt = null
          emit(t, 'error', 'Publisher declined our request', ds)
        }
        continue
      }
      if (!isActive(ds.status) || ds.status === 'backing_off') continue
      const { plan } = ds
      if (plan.failAt !== null && ds.p >= plan.failAt - EPS) {
        ds.status = 'needs_attention'
        ds.blocker = plan.blocker
        ds.lastBlocker = plan.blocker
        ds.blockedSince = t
        emit(t, 'error', `Blocked: ${BLOCKER_INFO[plan.blocker!].title}`, ds)
        continue
      }
      const episode = plan.episodes[ds.episodeIdx]
      if (episode !== undefined && ds.p >= episode.at - EPS) {
        ds.episodeIdx += 1
        ds.status = 'backing_off'
        ds.resumeAt = t + episode.durSec * 1000
        const what = episode.kind === 'rate_limited' ? 'Site is rate-limiting us (HTTP 429)' : 'Requests are timing out'
        emit(t, 'warn', `${what}, retrying automatically in ${Math.round(episode.durSec)}s`, ds)
        continue
      }
      if (ds.p >= 1 - EPS) {
        ds.p = 1
        ds.status = 'completed'
        ds.finishedAt = t
        const c = countersAt(ds.profile, spec.mode, 1, ds.entryPointAdded)
        emit(
          t,
          'success',
          spec.mode === 'recrawl'
            ? `Done: ${fmt(c.published)} new and ${fmt(c.updated)} updated documents, ${fmt(c.duplicates)} unchanged`
            : `Done: ${fmt(c.published)} documents published, ${fmt(c.duplicates)} duplicates skipped`,
          ds,
        )
        continue
      }
      const stage = stageOf(ds.p)
      if (stage !== ds.status) {
        const c = countersAt(ds.profile, spec.mode, ds.p, ds.entryPointAdded)
        emit(
          t,
          'info',
          stage === 'downloading'
            ? `Site mapped: ${fmt(c.pages)} pages, ${fmt(c.pdfsFound)} PDFs found`
            : `All ${fmt(c.downloaded)} PDFs downloaded, finishing processing`,
          ds,
        )
        ds.status = stage
      }
    }
  }

  const apply = (action: RunAction, t: number) => {
    const who = action.actor
    const note = action.note === undefined ? '' : ` (“${action.note}”)`
    if (action.type === 'pause_run' && cancelledAt === null && !runPaused) {
      runPaused = true
      for (const ds of states)
        if (isActive(ds.status)) {
          ds.status = 'paused'
          ds.heldByRun = true
          ds.resumeAt = null
        }
      emit(t, 'action', `${who} paused the run${note}`)
      return
    }
    if (action.type === 'resume_run' && runPaused) {
      runPaused = false
      for (const ds of states)
        if (ds.heldByRun) {
          ds.status = stageOf(ds.p)
          ds.heldByRun = false
        }
      emit(t, 'action', `${who} resumed the run${note}`)
      return
    }
    if (action.type === 'cancel_run' && cancelledAt === null) {
      cancelledAt = t
      runPaused = false
      for (const ds of states)
        if (!isTerminal(ds.status)) {
          ds.status = 'cancelled'
          ds.finishedAt = t
          ds.heldByRun = false
        }
      emit(t, 'action', `${who} cancelled the run${note}`)
      return
    }
    if (cancelledAt !== null) return
    for (const domain of action.domains ?? []) {
      const ds = byDomain.get(domain)
      if (ds === undefined || !(availableActions(ds.status) as readonly string[]).includes(action.type)) continue
      switch (action.type) {
        case 'pause':
          ds.status = 'paused'
          ds.heldByRun = false
          ds.resumeAt = null
          emit(t, 'action', `${who} paused this domain${note}`, ds)
          break
        case 'resume':
          ds.status = 'queued'
          ds.queueSeq = seq++
          emit(t, 'action', `${who} resumed this domain${note}`, ds)
          break
        case 'skip':
          ds.status = 'skipped'
          ds.finishedAt = t
          ds.resumeAt = null
          emit(t, 'action', `${who} skipped this domain${note}`, ds)
          break
        case 'retry':
          emit(t, 'action', `${who} asked for a retry${note}`, ds)
          requeue(ds, 'retry', false)
          break
        case 'assign':
          ds.owner = action.assignee ?? null
          emit(
            t,
            'action',
            ds.owner === null
              ? `${who} unassigned this domain`
              : ds.owner === who
                ? `${who} took ownership`
                : `${who} assigned this to ${ds.owner}`,
            ds,
          )
          break
        case 'note':
          if (action.note === undefined || action.note.trim() === '') break
          ds.notes.push({ at: t, actor: who, text: action.note })
          emit(t, 'action', `${who} added a note: “${action.note}”`, ds)
          break
        case 'resolve': {
          const remedy = action.remedy ?? 'retry'
          if (ds.status !== 'needs_attention' || !remediesFor(ds).includes(remedy)) break
          if ((OWNER_REMEDIES as readonly Remedy[]).includes(remedy)) {
            const r = rng(hash32('owner', spec.seed, ds.domain, ds.attempt))
            ds.status = 'waiting_owner'
            ds.ownerApproves = r.chance(OWNER_APPROVAL[remedy] ?? 0)
            ds.resumeAt = t + r.range(90, 240) * 1000
            ds.blocker = null
            emit(t, 'action', `${who} contacted the publisher${note}`, ds)
          } else {
            emit(t, 'action', `${who} chose “${REMEDY_INFO[remedy].label}”${note}`, ds)
            requeue(ds, remedy, false)
          }
          break
        }
      }
    }
  }

  let t = spec.createdAt
  let ai = 0
  for (let guard = 0; guard < 200_000; guard++) {
    fillSlots(t)
    let tNext = at
    if (ai < actions.length) tNext = Math.min(tNext, actions[ai]!.at)
    for (const ds of states) {
      if ((ds.status === 'backing_off' || ds.status === 'waiting_owner') && ds.resumeAt !== null)
        tNext = Math.min(tNext, ds.resumeAt)
      else if (isActive(ds.status)) tNext = Math.min(tNext, t + (nextMilestone(ds) - ds.p) * ds.plan.durationSec * 1000)
    }
    tNext = Math.max(t, tNext)
    advance(t, tNext)
    t = tNext
    settle(t)
    while (ai < actions.length && actions[ai]!.at <= t) apply(actions[ai++]!, t)
    if (t >= at && ai >= actions.length) {
      settle(t)
      fillSlots(t)
      break
    }
  }

  return finish(record, at, states, events, buckets, windowStart, runPaused, cancelledAt)
}

function remediesFor(ds: Pick<DomainState, 'blocker' | 'ownerDeclined'>): Remedy[] {
  if (ds.blocker === null) return []
  const all = BLOCKER_INFO[ds.blocker].remedies
  return ds.ownerDeclined ? all.filter((r) => !(OWNER_REMEDIES as readonly Remedy[]).includes(r)) : all
}

function finish(
  record: RunRecord,
  at: number,
  states: DomainState[],
  events: CrawlEvent[],
  buckets: Map<number, ThroughputPoint>,
  windowStart: number,
  runPaused: boolean,
  cancelledAt: number | null,
): RunDetail {
  const { spec } = record
  const statusCounts = emptyStatusCounts()
  const counters = emptyCounters()
  let pagesPerMin = 0
  let remainingSec = 0
  let maxActiveRemaining = 0

  const domains: DomainSnapshot[] = states.map((ds) => {
    statusCounts[ds.status] += 1
    const c = countersAt(ds.profile, spec.mode, ds.p, ds.entryPointAdded)
    addCounters(counters, c)
    const running = isActive(ds.status) && ds.status !== 'backing_off'
    const rate = running ? ratePerMin(ds, spec.mode) : 0
    pagesPerMin += rate
    const remaining = (1 - ds.p) * ds.plan.durationSec
    if (isActive(ds.status) || ds.status === 'queued') remainingSec += remaining
    if (isActive(ds.status)) maxActiveRemaining = Math.max(maxActiveRemaining, remaining)
    return {
      domain: ds.domain,
      status: ds.status,
      progress: ds.status === 'completed' ? 1 : ds.p,
      attempt: ds.attempt,
      blocker: ds.status === 'needs_attention' ? ds.blocker : null,
      blockedSince: ds.status === 'needs_attention' ? ds.blockedSince : null,
      ownerDeclined: ds.ownerDeclined,
      remedies: ds.status === 'needs_attention' ? remediesFor(ds) : [],
      resumeAt: ds.resumeAt,
      startedAt: ds.startedAt,
      finishedAt: ds.finishedAt,
      pagesPerMin: Math.round(rate),
      etaSec: isActive(ds.status) ? Math.round(remaining) : null,
      counters: c,
      lastEvent: ds.lastEvent,
      owner: ds.owner,
      notes: ds.notes,
    }
  })

  const inMotion =
    statusCounts.queued + statusCounts.waiting_owner + ACTIVE_STATUSES.reduce((n, s) => n + statusCounts[s], 0)
  const status: RunStatus =
    cancelledAt !== null
      ? 'cancelled'
      : runPaused
        ? 'paused'
        : inMotion > 0
          ? 'running'
          : statusCounts.needs_attention > 0
            ? 'blocked'
            : statusCounts.paused > 0
              ? 'paused'
              : 'completed'

  const finishedAt =
    status === 'cancelled'
      ? cancelledAt
      : status === 'completed'
        ? Math.max(...states.map((s) => s.finishedAt ?? 0))
        : null

  const throughput: ThroughputPoint[] = []
  for (let b = Math.max(windowStart, Math.floor(spec.createdAt / MINUTE) * MINUTE); b <= at; b += MINUTE)
    throughput.push(buckets.get(b) ?? { t: b, pages: 0, published: 0 })

  return {
    id: spec.id,
    name: spec.name,
    mode: spec.mode,
    settings: spec.settings,
    createdAt: spec.createdAt,
    createdBy: spec.createdBy,
    status,
    paused: runPaused,
    progress: domains.reduce((n, d) => n + (d.status === 'skipped' ? 1 : d.progress), 0) / Math.max(1, domains.length),
    domainCount: domains.length,
    statusCounts,
    attention: statusCounts.needs_attention,
    counters,
    pagesPerMin: Math.round(pagesPerMin),
    etaSec:
      status === 'running' && remainingSec > 0
        ? Math.round(Math.max(maxActiveRemaining, remainingSec / spec.settings.concurrency))
        : null,
    finishedAt,
    at,
    domains,
    events: events.filter((e) => e.at <= at),
    throughput,
    actions: record.actions.filter((a) => a.at <= at),
  }
}

function ratePerMin(ds: DomainState, mode: RunDetail['mode']): number {
  const dp = 0.002
  const a = countersAt(ds.profile, mode, ds.p, ds.entryPointAdded)
  const b = countersAt(ds.profile, mode, Math.min(1, ds.p + dp), ds.entryPointAdded)
  const fetched = b.pages - a.pages + (b.downloaded - a.downloaded)
  return (fetched / (dp * ds.plan.durationSec)) * 60
}
