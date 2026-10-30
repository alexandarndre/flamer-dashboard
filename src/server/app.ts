import { z } from 'zod'
import {
  ActionInput,
  CreateRunInput,
  DemoInput,
  ValidateInput,
  type ApiError,
  type BackendInfo,
  type CrawlEvent,
  type DemoState,
  type RunAction,
  type RunSpec,
  type ValidationResult,
} from '../shared/contract'
import { availableActions, BLOCKER_INFO, STATUS_INFO } from '../shared/catalog'
import { parseDomainList } from '../shared/domains'
import { ORG_TYPE_LABEL } from '../shared/geo'
import { issuesOf, overviewOf, pulseOf, registryOf, simulateAll, summarize } from './aggregate'
import { buildGraph } from './graph'
import { DOCS_HTML, openApiDocument } from './openapi'
import { seedRecords } from './seed'
import { simulateRun } from './sim/engine'
import { hash32 } from './sim/rng'
import { SHARED, type Clock, type Store, type Stores } from './store/types'

export const SANDBOX_HEADER = 'x-flamer-sandbox'
const SANDBOX_ID = /^[a-z0-9]{12,40}$/

export type AppContext = {
  stores: Stores
  runtime: BackendInfo['runtime']
  sandboxes?: boolean
  clock?: () => number
}

type Scope = {
  req: Request
  url: URL
  store: Store
  namespace: string
  clock: Clock | null
  now: () => number
}

type Handler = (scope: Scope, params: string[]) => Promise<Response>

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: unknown,
  ) {
    super(message)
  }
}

const NO_STORE = { 'cache-control': 'no-store' }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...NO_STORE } })

const csv = (filename: string, rows: (string | number | null)[][]) =>
  new Response(
    rows
      .map((r) =>
        r
          .map((c) => (c === null ? '' : /[",\n]/.test(String(c)) ? `"${String(c).replaceAll('"', '""')}"` : c))
          .join(','),
      )
      .join('\n') + '\n',
    {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        ...NO_STORE,
      },
    },
  )

const iso = (t: number | null) => (t === null ? null : new Date(t).toISOString())

async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.output<T>> {
  const parsed = schema.safeParse(await req.json().catch(() => undefined))
  if (!parsed.success) throw new HttpError(400, 'Invalid request body', z.treeifyError(parsed.error))
  return parsed.data
}

export const demoTime = (clock: Clock | null, real: number) =>
  clock === null ? real : Math.round(clock.anchorSim + (real - clock.anchorReal) * clock.speed)

export function createApp(ctx: AppContext): (req: Request) => Promise<Response> {
  const realNow = ctx.clock ?? Date.now
  const seeding = new Map<string, Promise<void>>()
  let openapi: ReturnType<typeof openApiDocument> | undefined

  const seed = (namespace: string, store: Store, now: number) => {
    let pending = seeding.get(namespace)
    if (pending === undefined) {
      pending = store
        .seedOnce(() => seedRecords(now))
        .catch((error: unknown) => {
          seeding.delete(namespace)
          throw error
        })
      seeding.set(namespace, pending)
    }
    return pending
  }

  const atOf = ({ url, now }: Scope) => {
    const raw = url.searchParams.get('at')
    const t = raw === null ? Number.NaN : Number(raw)
    return Number.isFinite(t) ? Math.min(t, now()) : now()
  }

  const load = async (store: Store, id: string) => {
    const record = await store.get(id)
    if (record === null) throw new HttpError(404, `Run ${id} not found`)
    return record
  }

  const demoState = ({ namespace, clock, now }: Scope): DemoState => ({
    speed: clock?.speed ?? 1,
    now: now(),
    realNow: realNow(),
    sandbox: namespace === SHARED ? null : namespace,
  })

  const routes: [string, RegExp, Handler][] = [
    [
      'GET',
      /^health$/,
      async ({ store, now }) =>
        json({ runtime: ctx.runtime, store: store.kind, durable: store.durable, now: now() } satisfies BackendInfo),
    ],
    ['GET', /^demo$/, async (scope) => json(demoState(scope))],
    [
      'POST',
      /^demo$/,
      async (scope) => {
        const { speed } = await body(scope.req, DemoInput)
        const clock: Clock = { anchorReal: realNow(), anchorSim: scope.now(), speed }
        await scope.store.setClock(clock)
        return json(demoState({ ...scope, clock, now: () => demoTime(clock, realNow()) }))
      },
    ],
    [
      'POST',
      /^demo\/reset$/,
      async (scope) => {
        await scope.store.reset()
        seeding.delete(scope.namespace)
        await seed(scope.namespace, scope.store, realNow())
        return json(demoState({ ...scope, clock: null, now: realNow }))
      },
    ],
    ['GET', /^openapi\.json$/, async () => json((openapi ??= openApiDocument()))],
    ['GET', /^docs$/, async () => new Response(DOCS_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } })],
    [
      'GET',
      /^overview$/,
      async (scope) => {
        const at = atOf(scope)
        return json(overviewOf(simulateAll(await scope.store.list(), at), at))
      },
    ],
    ['GET', /^runs$/, async ({ store, now }) => json(simulateAll(await store.list(), now()).map(summarize))],
    [
      'POST',
      /^runs$/,
      async ({ req, store, now }) => {
        const input = await body(req, CreateRunInput)
        const parsed = parseDomainList(input.domains.join('\n'))
        if (parsed.valid.length === 0) throw new HttpError(400, 'No valid domains in the list', parsed.invalid)
        const createdAt = now()
        const spec: RunSpec = {
          id: `run_${createdAt.toString(36)}${crypto.randomUUID().slice(0, 6)}`,
          name: input.name,
          mode: input.mode,
          settings: input.settings,
          domains: parsed.valid,
          createdAt,
          createdBy: input.actor,
          seed: hash32(createdAt, input.name),
        }
        await store.create(spec)
        return json(summarize(simulateRun({ spec, actions: [] }, createdAt)), 201)
      },
    ],
    ['GET', /^runs\/([\w-]+)$/, async (scope, [id]) => json(simulateRun(await load(scope.store, id!), atOf(scope)))],
    [
      'POST',
      /^runs\/([\w-]+)\/actions$/,
      async ({ req, store, now }, [id]) => {
        const input = await body(req, ActionInput)
        const record = await load(store, id!)
        const at = now()
        const current = simulateRun(record, at)
        if (current.status === 'cancelled') throw new HttpError(409, 'This run was cancelled')
        const action: RunAction = { id: crypto.randomUUID(), at, type: input.type, actor: input.actor }
        if (input.note !== undefined && input.note.trim().length > 0) action.note = input.note.trim()
        if ('domains' in input) {
          if (input.type === 'note' && action.note === undefined) throw new HttpError(400, 'A note needs some text')
          if (input.type === 'assign' && input.assignee === undefined)
            throw new HttpError(400, 'assign needs an assignee (or null to unassign)')
          const byDomain = new Map(current.domains.map((d) => [d.domain, d]))
          const rejected = input.domains.filter((d) => {
            const snapshot = byDomain.get(d)
            return (
              snapshot === undefined ||
              !availableActions(snapshot.status).includes(input.type) ||
              (input.type === 'resolve' && !snapshot.remedies.includes(input.remedy ?? 'retry'))
            )
          })
          if (rejected.length === input.domains.length)
            throw new HttpError(409, `“${input.type}” is not possible for ${rejected.join(', ')} right now`)
          action.domains = input.domains.filter((d) => !rejected.includes(d))
          if (input.remedy !== undefined) action.remedy = input.remedy
          if (input.type === 'assign') action.assignee = input.assignee ?? null
        } else if (input.type === 'pause_run' && current.paused) throw new HttpError(409, 'The run is already paused')
        else if (input.type === 'resume_run' && !current.paused) throw new HttpError(409, 'The run is not paused')
        await store.append(id!, [action])
        return json(simulateRun({ ...record, actions: [...record.actions, action] }, at))
      },
    ],
    [
      'GET',
      /^graph$/,
      async (scope) => {
        const focus = scope.url.searchParams.get('focus')
        if (focus !== null && !/^(run|domain|blocker|country):.+$/.test(focus))
          throw new HttpError(400, 'focus must look like run:<id>, domain:<name>, blocker:<code> or country:<ISO>')
        const at = atOf(scope)
        const graph = buildGraph(simulateAll(await scope.store.list(), at), focus, at)
        if (graph === null) throw new HttpError(404, `Nothing called ${focus} in the data`)
        return json(graph)
      },
    ],
    ['GET', /^issues$/, async ({ store, now }) => json(issuesOf(simulateAll(await store.list(), now())))],
    [
      'GET',
      /^issues\.csv$/,
      async ({ store, now }) =>
        csv('flamer-blocked-domains.csv', [
          ['domain', 'run', 'blocker', 'blocked_since', 'attempt', 'owner', 'notes', 'progress', 'publisher_declined'],
          ...issuesOf(simulateAll(await store.list(), now())).map((i) => [
            i.domain,
            i.runName,
            BLOCKER_INFO[i.blocker].title,
            iso(i.since),
            i.attempt,
            i.owner,
            i.notes,
            Math.round(i.progress * 100),
            i.ownerDeclined ? 'yes' : 'no',
          ]),
        ]),
    ],
    ['GET', /^domains$/, async ({ store, now }) => json(registryOf(simulateAll(await store.list(), now())))],
    [
      'GET',
      /^domains\.csv$/,
      async ({ store, now }) =>
        csv('flamer-domains.csv', [
          [
            'domain',
            'organisation',
            'type',
            'city',
            'country',
            'latest_status',
            'latest_run',
            'runs',
            'published',
            'duplicates',
            'rejected',
            'blockers',
            'next_recrawl',
          ],
          ...registryOf(simulateAll(await store.list(), now())).map((d) => [
            d.domain,
            d.org.name,
            ORG_TYPE_LABEL[d.org.type],
            d.org.place?.city ?? null,
            d.org.place?.countryName ?? null,
            STATUS_INFO[d.lastStatus].label,
            d.lastRunName,
            d.runs,
            d.published,
            d.duplicates,
            d.rejected,
            d.blockers.map((b) => BLOCKER_INFO[b].title).join('; '),
            iso(d.nextRecrawlAt),
          ]),
        ]),
    ],
    [
      'POST',
      /^validate$/,
      async ({ req, store, now }) => {
        const { text } = await body(req, ValidateInput)
        const parsed = parseDomainList(text)
        const inFlight = new Map<string, string>()
        for (const run of simulateAll(await store.list(), now()))
          if (run.status !== 'completed' && run.status !== 'cancelled')
            for (const d of run.domains)
              if (!['completed', 'skipped', 'cancelled'].includes(d.status)) inFlight.set(d.domain, run.name)
        return json({
          ...parsed,
          inFlight: parsed.valid.flatMap((d) => (inFlight.has(d) ? [{ domain: d, run: inFlight.get(d)! }] : [])),
        } satisfies ValidationResult)
      },
    ],
    ['GET', /^stream$/, async (scope) => stream(scope, realNow)],
  ]

  return async (req) => {
    const url = new URL(req.url)
    const path = url.pathname.replace(/^.*?\/api\/?/, '').replace(/\/$/, '')
    try {
      const requested = req.headers.get(SANDBOX_HEADER) ?? url.searchParams.get('sandbox') ?? ''
      const namespace = ctx.sandboxes !== false && SANDBOX_ID.test(requested) ? requested : SHARED
      const store = ctx.stores(namespace)
      const clock = await store.getClock()
      const scope: Scope = { req, url, store, namespace, clock, now: () => demoTime(clock, realNow()) }
      await seed(namespace, store, scope.now())
      for (const [method, pattern, handler] of routes) {
        const match = pattern.exec(path)
        if (match === null || req.method !== method) continue
        return await handler(scope, match.slice(1))
      }
      throw new HttpError(404, `No route for ${req.method} /api/${path}`)
    } catch (error) {
      if (error instanceof HttpError)
        return json({ error: error.message, issues: error.issues } satisfies ApiError, error.status)
      console.error(error)
      return json({ error: error instanceof Error ? error.message : 'Internal error' } satisfies ApiError, 500)
    }
  }
}

const STREAM_TICK_MS = 2000
const STREAM_LIFETIME_MS = 55_000
const STORE_REFRESH_MS = 4000

function stream({ store, req, clock: initialClock }: Scope, realNow: () => number): Response {
  const encoder = new TextEncoder()
  let timer: ReturnType<typeof setTimeout> | undefined
  const seen = new Set<string>()
  const keyOf = (e: CrawlEvent) => `${e.at}|${e.runId}|${e.domain ?? ''}|${e.message}`

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let clock = initialClock
      const startedReal = realNow()
      let records = await store.list()
      let loadedAt = startedReal
      let closed = false
      const close = () => {
        if (closed) return
        closed = true
        clearTimeout(timer)
        controller.close()
      }
      req.signal.addEventListener('abort', close)
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))

      controller.enqueue(encoder.encode('retry: 1500\n\n'))
      const first = demoTime(clock, startedReal)
      for (const e of overviewOf(simulateAll(records, first), first).events) seen.add(keyOf(e))

      const tick = async () => {
        if (closed) return
        try {
          const real = realNow()
          if (real - loadedAt >= STORE_REFRESH_MS) {
            ;[records, clock] = await Promise.all([store.list(), store.getClock()])
            loadedAt = real
          }
          const t = demoTime(clock, real)
          const overview = overviewOf(simulateAll(records, t), t)
          send('pulse', pulseOf(overview))
          const fresh = overview.events.filter((e) => !seen.has(keyOf(e))).reverse()
          for (const e of fresh) seen.add(keyOf(e))
          if (fresh.length > 0) send('activity', fresh)
          if (real - startedReal >= STREAM_LIFETIME_MS) return close()
          timer = setTimeout(tick, STREAM_TICK_MS)
        } catch (error) {
          console.error(error)
          close()
        }
      }
      await tick()
    },
    cancel() {
      clearTimeout(timer)
    },
  })

  return new Response(body, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  })
}
