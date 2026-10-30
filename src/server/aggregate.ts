import {
  DOMAIN_STATUSES,
  type Issue,
  type Overview,
  type Pulse,
  type RegistryEntry,
  type RunDetail,
  type RunRecord,
  type RunSummary,
} from '../shared/contract'
import { orgOf } from '../shared/geo'
import { emptyStatusCounts, simulateRun } from './sim/engine'
import { addCounters, emptyCounters } from './sim/profile'

const DAY = 86_400_000

export function summarize(detail: RunDetail): RunSummary {
  const { at: _at, domains: _domains, events: _events, throughput: _throughput, actions: _actions, ...summary } = detail
  return summary
}

export function simulateAll(records: RunRecord[], at: number): RunDetail[] {
  return records
    .filter((r) => r.spec.createdAt <= at)
    .map((r) => simulateRun(r, at))
    .toSorted((a, b) => b.createdAt - a.createdAt)
}

export function issuesOf(details: RunDetail[]): Issue[] {
  return details
    .flatMap((run) =>
      run.domains
        .filter((d) => d.status === 'needs_attention' && d.blocker !== null)
        .map((d) => ({
          runId: run.id,
          runName: run.name,
          domain: d.domain,
          blocker: d.blocker!,
          since: d.blockedSince ?? run.at,
          attempt: d.attempt,
          remedies: d.remedies,
          ownerDeclined: d.ownerDeclined,
          progress: d.progress,
          owner: d.owner,
          notes: d.notes.length,
        })),
    )
    .toSorted((a, b) => a.since - b.since)
}

export function overviewOf(details: RunDetail[], at: number): Overview {
  const totals = emptyCounters()
  const statusCounts = emptyStatusCounts()
  const throughput = new Map<number, { t: number; pages: number; published: number }>()
  for (const run of details) {
    addCounters(totals, run.counters)
    for (const s of DOMAIN_STATUSES) statusCounts[s] += run.statusCounts[s]
    for (const point of run.throughput) {
      const into = throughput.get(point.t) ?? { t: point.t, pages: 0, published: 0 }
      into.pages += point.pages
      into.published += point.published
      throughput.set(point.t, into)
    }
  }
  return {
    at,
    totals,
    statusCounts,
    activeRuns: details.filter((r) => r.status === 'running' || r.status === 'paused').length,
    pagesPerMin: details.reduce((n, r) => n + r.pagesPerMin, 0),
    attention: statusCounts.needs_attention,
    throughput: [...throughput.values()].toSorted((a, b) => a.t - b.t),
    runs: details.map(summarize),
    issues: issuesOf(details),
    events: details
      .flatMap((r) => r.events)
      .toSorted((a, b) => b.at - a.at)
      .slice(0, 80),
  }
}

export function pulseOf(overview: Overview): Pulse {
  return {
    now: overview.at,
    activeRuns: overview.activeRuns,
    attention: overview.attention,
    pagesPerMin: overview.pagesPerMin,
    runs: overview.runs.map(({ id, status, progress, attention }) => ({ id, status, progress, attention })),
  }
}

export function registryOf(details: RunDetail[]): RegistryEntry[] {
  const entries = new Map<string, RegistryEntry>()
  for (const run of details.toSorted((a, b) => a.createdAt - b.createdAt)) {
    for (const d of run.domains) {
      const entry = entries.get(d.domain) ?? {
        domain: d.domain,
        org: orgOf(d.domain),
        runIds: [],
        runs: 0,
        lastRunId: run.id,
        lastRunName: run.name,
        lastStatus: d.status,
        lastSeen: run.createdAt,
        published: 0,
        duplicates: 0,
        rejected: 0,
        blockers: [],
        recrawlEveryDays: null,
        nextRecrawlAt: null,
      }
      entry.runs += 1
      entry.runIds.push(run.id)
      entry.lastRunId = run.id
      entry.lastRunName = run.name
      entry.lastStatus = d.status
      entry.lastSeen = d.finishedAt ?? d.lastEvent?.at ?? run.createdAt
      entry.published += d.counters.published + d.counters.updated
      entry.duplicates += d.counters.duplicates
      entry.rejected += d.counters.rejected
      if (d.blocker !== null && !entry.blockers.includes(d.blocker)) entry.blockers.push(d.blocker)
      const every = run.settings.recrawlEveryDays ?? 0
      entry.recrawlEveryDays = every > 0 ? every : null
      entry.nextRecrawlAt =
        every > 0 && d.status === 'completed' && d.finishedAt !== null ? d.finishedAt + every * DAY : null
      entries.set(d.domain, entry)
    }
  }
  return [...entries.values()].toSorted((a, b) => b.lastSeen - a.lastSeen)
}
