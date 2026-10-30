import type { RunRecord } from '../../shared/contract'
import type { Clock, Store } from './types'

const RUNS = 'runs'
const META = 'meta'

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export function indexedDbStore(name = 'flamer'): Store {
  const db = new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(name, 1)
    open.onupgradeneeded = () => {
      open.result.createObjectStore(RUNS, { keyPath: 'spec.id' })
      open.result.createObjectStore(META)
    }
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
  })

  const tx = async (stores: string[], mode: IDBTransactionMode) => (await db).transaction(stores, mode)

  return {
    kind: 'indexeddb',
    durable: true,
    list: async () => request<RunRecord[]>((await tx([RUNS], 'readonly')).objectStore(RUNS).getAll()),
    get: async (id) =>
      (await request<RunRecord | undefined>((await tx([RUNS], 'readonly')).objectStore(RUNS).get(id))) ?? null,
    create: async (spec) => {
      const t = await tx([RUNS], 'readwrite')
      t.objectStore(RUNS).put({ spec, actions: [] } satisfies RunRecord)
      await done(t)
    },
    append: async (id, actions) => {
      const t = await tx([RUNS], 'readwrite')
      const runs = t.objectStore(RUNS)
      const record = await request<RunRecord | undefined>(runs.get(id))
      if (record !== undefined) runs.put({ ...record, actions: [...record.actions, ...actions] })
      await done(t)
    },
    getClock: async () =>
      (await request<Clock | undefined>((await tx([META], 'readonly')).objectStore(META).get('clock'))) ?? null,
    setClock: async (clock) => {
      const t = await tx([META], 'readwrite')
      t.objectStore(META).put(clock, 'clock')
      await done(t)
    },
    reset: async () => {
      const t = await tx([RUNS, META], 'readwrite')
      t.objectStore(RUNS).clear()
      t.objectStore(META).clear()
      await done(t)
    },
    seedOnce: async (make) => {
      const t = await tx([RUNS, META], 'readwrite')
      const meta = t.objectStore(META)
      if ((await request(meta.get('seeded'))) === undefined) {
        meta.put(Date.now(), 'seeded')
        for (const record of make()) t.objectStore(RUNS).put(record)
      }
      await done(t)
    },
  }
}
