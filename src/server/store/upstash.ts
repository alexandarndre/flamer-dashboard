import type { RunAction, RunRecord, RunSpec } from '../../shared/contract'
import { SHARED, type Clock, type Store, type Stores } from './types'

type Command = (string | number)[]
type Reply = { result?: unknown; error?: string }

const SANDBOX_TTL_SEC = 14 * 24 * 60 * 60

export function upstashStore(url: string, token: string, namespace = SHARED): Store {
  const prefix = namespace === SHARED ? 'flamer:' : `flamer:sb:${namespace}:`
  const RUNS = `${prefix}runs`
  const SEEDED = `${prefix}seeded`
  const CLOCK = `${prefix}clock`
  const specKey = (id: string) => `${prefix}run:${id}`
  const actionsKey = (id: string) => `${prefix}run:${id}:actions`
  const touch = (...keys: string[]): Command[] =>
    namespace === SHARED ? [] : [...keys, RUNS, SEEDED, CLOCK].map((k) => ['EXPIRE', k, SANDBOX_TTL_SEC])

  const pipeline = async (commands: Command[]): Promise<unknown[]> => {
    const response = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(commands),
    })
    if (!response.ok) throw new Error(`Upstash ${response.status}: ${await response.text()}`)
    const replies = (await response.json()) as Reply[]
    const failed = replies.find((r) => r.error !== undefined)
    if (failed !== undefined) throw new Error(`Upstash: ${failed.error}`)
    return replies.map((r) => r.result)
  }

  const ids = async () => (await pipeline([['ZRANGE', RUNS, 0, -1]]))[0] as string[]

  const load = async (list: string[]): Promise<RunRecord[]> => {
    if (list.length === 0) return []
    const replies = await pipeline(
      list.flatMap((id) => [
        ['GET', specKey(id)],
        ['LRANGE', actionsKey(id), 0, -1],
      ]),
    )
    return list.flatMap((_, i) => {
      const spec = replies[i * 2]
      if (typeof spec !== 'string') return []
      const actions = (replies[i * 2 + 1] as string[]).map((a) => JSON.parse(a) as RunAction)
      return [{ spec: JSON.parse(spec) as RunSpec, actions }]
    })
  }

  return {
    kind: 'upstash',
    durable: true,
    list: async () => load(await ids()),
    get: async (id) => (await load([id]))[0] ?? null,
    create: async (spec) => {
      await pipeline([
        ['SET', specKey(spec.id), JSON.stringify(spec)],
        ['ZADD', RUNS, spec.createdAt, spec.id],
        ...touch(specKey(spec.id)),
      ])
    },
    append: async (id, actions) => {
      await pipeline([
        ['RPUSH', actionsKey(id), ...actions.map((a) => JSON.stringify(a))],
        ...touch(specKey(id), actionsKey(id)),
      ])
    },
    seedOnce: async (make) => {
      const [claimed] = await pipeline([['SET', SEEDED, Date.now(), 'NX']])
      if (claimed !== 'OK') return
      const records = make()
      await pipeline(
        records.flatMap(({ spec, actions }) => [
          ['SET', specKey(spec.id), JSON.stringify(spec)],
          ['ZADD', RUNS, spec.createdAt, spec.id],
          ...(actions.length > 0 ? [['RPUSH', actionsKey(spec.id), ...actions.map((a) => JSON.stringify(a))]] : []),
          ...touch(specKey(spec.id), actionsKey(spec.id)),
        ]),
      )
    },
    getClock: async () => {
      const [raw] = await pipeline([['GET', CLOCK]])
      return typeof raw === 'string' ? (JSON.parse(raw) as Clock) : null
    },
    setClock: async (clock) => {
      await pipeline([['SET', CLOCK, JSON.stringify(clock)], ...touch()])
    },
    reset: async () => {
      const list = await ids()
      await pipeline([['DEL', RUNS, SEEDED, CLOCK, ...list.flatMap((id) => [specKey(id), actionsKey(id)])]])
    },
  }
}

export function upstashStores(url: string, token: string): Stores {
  return (namespace) => upstashStore(url, token, namespace)
}
