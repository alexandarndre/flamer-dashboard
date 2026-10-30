import type { RunRecord } from '../../shared/contract'
import type { Clock, Store, Stores } from './types'

export function memoryStore(): Store {
  const runs = new Map<string, RunRecord>()
  let seeded = false
  let clock: Clock | null = null
  return {
    kind: 'memory',
    durable: false,
    list: async () => [...runs.values()].map(clone),
    get: async (id) => {
      const record = runs.get(id)
      return record === undefined ? null : clone(record)
    },
    create: async (spec) => {
      runs.set(spec.id, { spec, actions: [] })
    },
    append: async (id, actions) => {
      runs.get(id)?.actions.push(...actions)
    },
    seedOnce: async (make) => {
      if (seeded) return
      seeded = true
      for (const record of make()) runs.set(record.spec.id, record)
    },
    getClock: async () => clock,
    setClock: async (next) => {
      clock = next
    },
    reset: async () => {
      runs.clear()
      seeded = false
      clock = null
    },
  }
}

export function memoryStores(): Stores {
  const stores = new Map<string, Store>()
  return (namespace) => {
    let store = stores.get(namespace)
    if (store === undefined) stores.set(namespace, (store = memoryStore()))
    return store
  }
}

const clone = (r: RunRecord): RunRecord => ({ spec: r.spec, actions: [...r.actions] })
