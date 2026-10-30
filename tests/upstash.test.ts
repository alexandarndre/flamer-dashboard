import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { upstashStore } from '../src/server/store/upstash'
import type { RunSpec } from '../src/shared/contract'

let keys: () => string[] = () => []
let expired: () => string[] = () => []

function fakeUpstash() {
  const strings = new Map<string, string>()
  const lists = new Map<string, string[]>()
  const zsets = new Map<string, Map<string, number>>()
  const expiring = new Set<string>()
  keys = () => [...strings.keys(), ...lists.keys(), ...zsets.keys()]
  expired = () => [...expiring]
  const run = ([cmd, key, ...args]: string[]): unknown => {
    switch (cmd) {
      case 'GET':
        return strings.get(key!) ?? null
      case 'SET':
        if (args.includes('NX') && strings.has(key!)) return null
        strings.set(key!, String(args[0]))
        return 'OK'
      case 'ZADD':
        zsets.set(key!, (zsets.get(key!) ?? new Map()).set(String(args[1]), Number(args[0])))
        return 1
      case 'ZRANGE':
        return [...(zsets.get(key!) ?? new Map()).entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m)
      case 'RPUSH':
        lists.set(key!, [...(lists.get(key!) ?? []), ...args.map(String)])
        return lists.get(key!)!.length
      case 'LRANGE':
        return lists.get(key!) ?? []
      case 'DEL':
        for (const k of [key!, ...args]) {
          strings.delete(k)
          lists.delete(k)
          zsets.delete(k)
        }
        return 1
      case 'EXPIRE':
        expiring.add(key!)
        return 1
      default:
        return { error: `unsupported ${cmd}` }
    }
  }
  return vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe('https://redis.example/pipeline')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer token')
    const commands = JSON.parse(String(init.body)) as string[][]
    return Response.json(commands.map((c) => ({ result: run(c) })))
  })
}

const spec: RunSpec = {
  id: 'run_x',
  name: 'Redis run',
  mode: 'backfill',
  settings: { concurrency: 2, pace: 'standard', respectRobots: true },
  domains: ['wri.org'],
  createdAt: 1,
  createdBy: 'Tester',
  seed: 1,
}

describe('upstashStore', () => {
  beforeEach(() => vi.stubGlobal('fetch', fakeUpstash()))
  afterEach(() => vi.unstubAllGlobals())

  it('round-trips runs and appends actions in order', async () => {
    const store = upstashStore('https://redis.example/', 'token')
    await store.create(spec)
    await store.append('run_x', [{ id: 'a1', at: 2, type: 'pause_run', actor: 'Tester' }])
    await store.append('run_x', [{ id: 'a2', at: 3, type: 'resume_run', actor: 'Tester' }])
    const record = await store.get('run_x')
    expect(record?.spec).toEqual(spec)
    expect(record?.actions.map((a) => a.id)).toEqual(['a1', 'a2'])
    expect(await store.get('missing')).toBeNull()
  })

  it('keeps sandboxes under their own prefix with an expiry, and resets them', async () => {
    const store = upstashStore('https://redis.example', 'token', 'visitor0000001')
    await store.create(spec)
    await store.setClock({ anchorReal: 1, anchorSim: 1, speed: 10 })
    expect(keys().every((k) => k.startsWith('flamer:sb:visitor0000001:'))).toBe(true)
    expect(expired()).toContain('flamer:sb:visitor0000001:run:run_x')
    expect(await store.getClock()).toEqual({ anchorReal: 1, anchorSim: 1, speed: 10 })
    await store.reset()
    expect(keys()).toEqual([])
  })

  it('seeds exactly once across instances', async () => {
    const make = vi.fn(() => [{ spec, actions: [] }])
    await upstashStore('https://redis.example', 'token').seedOnce(make)
    await upstashStore('https://redis.example', 'token').seedOnce(make)
    expect(make).toHaveBeenCalledTimes(1)
    expect((await upstashStore('https://redis.example', 'token').list()).map((r) => r.spec.id)).toEqual(['run_x'])
  })
})
