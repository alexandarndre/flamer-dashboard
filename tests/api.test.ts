import { describe, expect, it } from 'vitest'
import { createApp } from '../src/server/app'
import { memoryStores } from '../src/server/store/memory'
import type { Overview, RunDetail, RunSummary } from '../src/shared/contract'

let clock = Date.UTC(2026, 9, 29, 10, 0)
const app = createApp({ stores: memoryStores(), runtime: 'node-dev', clock: () => clock })

const call = async <T>(path: string, init?: { method?: string; body?: unknown }) => {
  const response = await app(
    new Request(`http://test/api/${path}`, {
      method: init?.method ?? 'GET',
      headers: { 'content-type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    }),
  )
  return { status: response.status, data: (await response.json()) as T }
}

describe('api', () => {
  it('serves seeded data on first request', async () => {
    const { status, data } = await call<Overview>('overview')
    expect(status).toBe(200)
    expect(data.runs.length).toBe(4)
  })

  it('creates a run from messy input and acts on it', async () => {
    const created = await call<RunSummary>('runs', {
      method: 'POST',
      body: {
        name: 'Climate think tanks',
        mode: 'backfill',
        settings: { concurrency: 2, pace: 'gentle', respectRobots: true },
        domains: ['https://www.wri.org/research', 'wri.org', 'e3g.org', 'not a domain'],
      },
    })
    expect(created.status).toBe(201)
    expect(created.data.domainCount).toBe(2)

    clock += 30_000
    const detail = await call<RunDetail>(`runs/${created.data.id}`)
    expect(detail.data.domains.map((d) => d.domain)).toEqual(['wri.org', 'e3g.org'])

    const paused = await call<RunDetail>(`runs/${created.data.id}/actions`, {
      method: 'POST',
      body: { type: 'pause', domains: ['wri.org'] },
    })
    expect(paused.data.domains[0]!.status).toBe('paused')

    const invalid = await call<{ error: string }>(`runs/${created.data.id}/actions`, {
      method: 'POST',
      body: { type: 'resolve', remedy: 'solved_session', domains: ['wri.org'] },
    })
    expect(invalid.status).toBe(409)
  })

  it('rejects malformed bodies with 400', async () => {
    const { status } = await call('runs', { method: 'POST', body: { name: 'x' } })
    expect(status).toBe(400)
  })

  it('time-travels with ?at=', async () => {
    const past = await call<RunDetail>(`runs/run_igo_weekly?at=${clock - 30 * 60_000}`)
    const live = await call<RunDetail>('runs/run_igo_weekly')
    expect(past.data.counters.pages).toBeLessThan(live.data.counters.pages)
  })

  it('serves a focused context graph and validates the focus', async () => {
    const graph = await call<{ focus: string; nodes: { id: string; depth: number }[] }>(
      'graph?focus=run:run_igo_weekly',
    )
    expect(graph.status).toBe(200)
    expect(graph.data.nodes.find((n) => n.id === 'run:run_igo_weekly')?.depth).toBe(0)
    expect((await call('graph?focus=planet:mars')).status).toBe(400)
    expect((await call('graph?focus=run:missing')).status).toBe(404)
  })

  it('assigns owners and keeps notes on domains', async () => {
    const issues = await call<{ runId: string; domain: string }[]>('issues')
    const { runId, domain } = issues.data[0]!
    const assigned = await call<RunDetail>(`runs/${runId}/actions`, {
      method: 'POST',
      body: { type: 'assign', domains: [domain], assignee: 'Sonia', actor: 'Sonia' },
    })
    expect(assigned.data.domains.find((d) => d.domain === domain)?.owner).toBe('Sonia')
    const noted = await call<RunDetail>(`runs/${runId}/actions`, {
      method: 'POST',
      body: { type: 'note', domains: [domain], note: 'Emailed their webmaster', actor: 'Sonia' },
    })
    expect(noted.data.domains.find((d) => d.domain === domain)?.notes.map((n) => n.text)).toEqual([
      'Emailed their webmaster',
    ])
    expect(
      (await call(`runs/${runId}/actions`, { method: 'POST', body: { type: 'note', domains: [domain] } })).status,
    ).toBe(400)
    const after = await call<{ domain: string; owner: string | null; notes: number }[]>('issues')
    expect(after.data.find((i) => i.domain === domain)).toMatchObject({ owner: 'Sonia', notes: 1 })
  })

  it('exports CSV', async () => {
    const response = await app(new Request('http://test/api/issues.csv'))
    expect(response.headers.get('content-type')).toContain('text/csv')
    const [header, ...rows] = (await response.text()).trim().split('\n')
    expect(header).toBe('domain,run,blocker,blocked_since,attempt,owner,notes,progress,publisher_declined')
    expect(rows.length).toBeGreaterThan(0)
  })

  it('publishes an OpenAPI document', async () => {
    const { data } = await call<{ openapi: string; paths: Record<string, unknown> }>('openapi.json')
    expect(data.openapi).toBe('3.1.0')
    expect(Object.keys(data.paths)).toContain('/api/runs/{runId}/actions')
  })

  it('isolates visitor sandboxes, speeds up the demo clock and resets', async () => {
    const sandbox = { 'x-flamer-sandbox': 'visitor0000001' }
    const get = async <T>(path: string, init: RequestInit = {}) =>
      (await (
        await app(
          new Request(`http://test/api/${path}`, {
            ...init,
            headers: { ...sandbox, 'content-type': 'application/json' },
          }),
        )
      ).json()) as T

    const created = await call<RunSummary>('runs', {
      method: 'POST',
      body: {
        name: 'Shared only',
        mode: 'backfill',
        settings: { concurrency: 1, pace: 'gentle', respectRobots: true },
        domains: ['wri.org'],
      },
    })
    const mine = await get<RunSummary[]>('runs')
    expect(mine.map((r) => r.id)).not.toContain(created.data.id)
    expect(mine).toHaveLength(4)

    const before = await get<{ now: number; speed: number; sandbox: string }>('demo')
    expect(before).toMatchObject({ speed: 1, sandbox: 'visitor0000001' })
    await get('demo', { method: 'POST', body: JSON.stringify({ speed: 60 }) })
    clock += 60_000
    const after = await get<{ now: number; speed: number }>('demo')
    expect(after.speed).toBe(60)
    expect(after.now - before.now).toBeGreaterThanOrEqual(60 * 60_000)

    const reset = await get<{ speed: number }>('demo/reset', { method: 'POST' })
    expect(reset.speed).toBe(1)
    expect(await get<RunSummary[]>('runs')).toHaveLength(4)
  })

  it('streams pulses over SSE', async () => {
    const response = await app(new Request('http://test/api/stream'))
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    const reader = response.body!.getReader()
    let text = ''
    while (!text.includes('event: pulse')) text += new TextDecoder().decode((await reader.read()).value)
    await reader.cancel()
    expect(text).toContain('retry: 1500')
  })
})
