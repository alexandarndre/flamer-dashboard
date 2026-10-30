import { describe, expect, it } from 'vitest'
import { ACTIVE_STATUSES } from '../src/shared/catalog'
import type { RunAction, RunRecord, RunSpec } from '../src/shared/contract'
import { parseDomainList } from '../src/shared/domains'
import { seedRecords } from '../src/server/seed'
import { simulateRun } from '../src/server/sim/engine'

const MIN = 60_000
const T0 = Date.UTC(2026, 9, 29, 10, 0)

const run = (domains: string[], extra: Partial<RunSpec> = {}, actions: RunAction[] = []): RunRecord => ({
  spec: {
    id: 'run_test',
    name: 'Test run',
    mode: 'backfill',
    settings: { concurrency: 3, pace: 'standard', respectRobots: true },
    domains,
    createdAt: T0,
    createdBy: 'Tester',
    seed: 42,
    ...extra,
  },
  actions,
})

const action = (at: number, a: Omit<RunAction, 'id' | 'at' | 'actor'>): RunAction => ({
  id: `a${at}`,
  at,
  actor: 'Tester',
  ...a,
})

const DOMAINS = ['brookings.edu', 'rand.org', 'urban.org', 'wri.org', 'cgdev.org', 'bruegel.org', 'csis.org']

describe('simulateRun', () => {
  it('is a pure function of record and time', () => {
    const record = run(DOMAINS)
    expect(simulateRun(record, T0 + 7 * MIN)).toEqual(simulateRun(record, T0 + 7 * MIN))
  })

  it('never decreases counters as time passes', () => {
    const record = run(DOMAINS)
    let previous = simulateRun(record, T0).counters
    for (let t = T0 + 30_000; t < T0 + 40 * MIN; t += 30_000) {
      const { counters } = simulateRun(record, t)
      expect(counters.pages).toBeGreaterThanOrEqual(previous.pages)
      expect(counters.published).toBeGreaterThanOrEqual(previous.published)
      expect(counters.processed).toBeLessThanOrEqual(counters.downloaded)
      expect(counters.downloaded).toBeLessThanOrEqual(counters.pdfsFound)
      previous = counters
    }
  })

  it('respects the concurrency limit', () => {
    const record = run(DOMAINS)
    for (let t = T0; t < T0 + 40 * MIN; t += 20_000) {
      const active = simulateRun(record, t).domains.filter((d) => ACTIVE_STATUSES.includes(d.status))
      expect(active.length).toBeLessThanOrEqual(3)
    }
  })

  it('finishes every unblocked domain eventually', () => {
    const detail = simulateRun(run(DOMAINS), T0 + 6 * 60 * MIN)
    for (const d of detail.domains) expect(['completed', 'needs_attention']).toContain(d.status)
    expect(['completed', 'blocked']).toContain(detail.status)
    expect(detail.counters.published).toBeGreaterThan(0)
  })

  it('freezes progress while the run is paused and continues after resume', () => {
    const record = run(DOMAINS, {}, [
      action(T0 + 3 * MIN, { type: 'pause_run' }),
      action(T0 + 13 * MIN, { type: 'resume_run' }),
    ])
    const a = simulateRun(record, T0 + 4 * MIN)
    const b = simulateRun(record, T0 + 12 * MIN)
    expect(a.status).toBe('paused')
    expect(b.counters).toEqual(a.counters)
    expect(simulateRun(record, T0 + 16 * MIN).counters.pages).toBeGreaterThan(b.counters.pages)
  })

  it('cancels every unfinished domain', () => {
    const detail = simulateRun(run(DOMAINS, {}, [action(T0 + 2 * MIN, { type: 'cancel_run' })]), T0 + 30 * MIN)
    expect(detail.status).toBe('cancelled')
    expect(detail.domains.every((d) => ['completed', 'cancelled'].includes(d.status))).toBe(true)
  })

  it('blocks a CAPTCHA domain and lets an operator unblock it', () => {
    const base = run(['who.int'], { settings: { concurrency: 1, pace: 'standard', respectRobots: true } })
    const blocked = simulateRun(base, T0 + 60 * MIN).domains[0]!
    expect(blocked.status).toBe('needs_attention')
    expect(blocked.blocker).toBe('captcha')
    expect(blocked.remedies).toContain('solved_session')

    const fixAt = blocked.blockedSince! + MIN
    const fixed = run(['who.int'], base.spec, [
      action(fixAt, { type: 'resolve', remedy: 'solved_session', domains: ['who.int'] }),
    ])
    const after = simulateRun(fixed, fixAt + 1000).domains[0]!
    expect(after.attempt).toBe(2)
    expect(after.status).not.toBe('needs_attention')
    expect(after.progress).toBeGreaterThanOrEqual(blocked.progress)
    expect(after.progress - blocked.progress).toBeLessThan(0.01)
  })

  it('routes publisher requests through a waiting state with a decision', () => {
    const base = run(['ecb.europa.eu'])
    const blocked = simulateRun(base, T0 + 5 * MIN).domains[0]!
    expect(blocked.blocker).toBe('robots')
    const askAt = T0 + 6 * MIN
    const asked = run(['ecb.europa.eu'], base.spec, [
      action(askAt, { type: 'resolve', remedy: 'request_permission', domains: ['ecb.europa.eu'] }),
    ])
    expect(simulateRun(asked, askAt + 1000).domains[0]!.status).toBe('waiting_owner')
    const decided = simulateRun(asked, askAt + 5 * MIN).domains[0]!
    expect(decided.status === 'needs_attention' ? decided.ownerDeclined : decided.attempt === 2).toBe(true)
  })

  it('ignores robots.txt blocks when the run is configured not to respect them', () => {
    const detail = simulateRun(
      run(['ecb.europa.eu'], { settings: { concurrency: 1, pace: 'standard', respectRobots: false } }),
      T0 + 5 * MIN,
    )
    expect(detail.domains[0]!.status).not.toBe('needs_attention')
  })

  it('reports per-minute throughput from the start of the run, capped at an hour', () => {
    const detail = simulateRun(run(DOMAINS), T0 + 20 * MIN)
    expect(detail.throughput).toHaveLength(21)
    expect(simulateRun(run(DOMAINS), T0 + 3 * 60 * MIN).throughput).toHaveLength(60)
    expect(detail.throughput.reduce((n, p) => n + p.pages, 0)).toBeGreaterThan(0)
  })
})

describe('seed data', () => {
  it('produces a lively demo state', () => {
    const now = T0
    const details = seedRecords(now).map((r) => simulateRun(r, now))
    const statuses = new Set(details.map((d) => d.status))
    expect(statuses.has('running')).toBe(true)
    expect(statuses.has('cancelled')).toBe(true)
    expect(details.reduce((n, d) => n + d.attention, 0)).toBeGreaterThan(1)
  })
})

describe('parseDomainList', () => {
  it('normalizes, dedupes and explains rejects', () => {
    const parsed = parseDomainList(
      'domain\nhttps://www.WHO.int/publications\nwho.int\noecd.org, imf\n10.0.0.1\nbad_domain.org',
    )
    expect(parsed.valid).toEqual(['who.int', 'oecd.org'])
    expect(parsed.duplicates).toEqual(['who.int'])
    expect(parsed.invalid.map((i) => i.input)).toEqual(['imf', '10.0.0.1', 'bad_domain.org'])
  })
})
