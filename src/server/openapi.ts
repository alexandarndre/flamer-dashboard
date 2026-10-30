import { z } from 'zod'
import * as C from '../shared/contract'

type Body = keyof typeof SCHEMAS | 'csv' | 'sse' | 'html'
type Op = {
  method: 'get' | 'post'
  path: string
  summary: string
  tag: string
  query?: { name: string; description: string }[]
  body?: keyof typeof SCHEMAS
  response: Body | [keyof typeof SCHEMAS]
  status?: number
}

const SCHEMAS = {
  BackendInfo: C.BackendInfo,
  DemoState: C.DemoState,
  DemoInput: C.DemoInput,
  Overview: C.Overview,
  RunSummary: C.RunSummary,
  RunDetail: C.RunDetail,
  CreateRunInput: C.CreateRunInput,
  ActionInput: C.ActionInput,
  Issue: C.Issue,
  RegistryEntry: C.RegistryEntry,
  Graph: C.Graph,
  ValidateInput: C.ValidateInput,
  ValidationResult: C.ValidationResult,
  Pulse: C.Pulse,
  CrawlEvent: C.CrawlEvent,
  ApiError: C.ApiError,
}

const INPUTS = new Set<keyof typeof SCHEMAS>(['CreateRunInput', 'ActionInput', 'ValidateInput', 'DemoInput'])

const AT = { name: 'at', description: 'Replay: compute the state at this time (ms, demo clock). Defaults to now.' }

const OPS: Op[] = [
  { method: 'get', path: '/health', summary: 'Runtime and storage in use', tag: 'System', response: 'BackendInfo' },
  { method: 'get', path: '/demo', summary: 'Demo clock and sandbox', tag: 'Demo', response: 'DemoState' },
  {
    method: 'post',
    path: '/demo',
    summary: 'Change the demo clock speed (1×, 10×, 60×)',
    tag: 'Demo',
    body: 'DemoInput',
    response: 'DemoState',
  },
  {
    method: 'post',
    path: '/demo/reset',
    summary: 'Wipe this sandbox and re-seed the demo data',
    tag: 'Demo',
    response: 'DemoState',
  },
  {
    method: 'get',
    path: '/overview',
    summary: 'KPIs, throughput, runs, open issues, recent events',
    tag: 'Monitor',
    query: [AT],
    response: 'Overview',
  },
  { method: 'get', path: '/runs', summary: 'Run summaries', tag: 'Runs', response: ['RunSummary'] },
  {
    method: 'post',
    path: '/runs',
    summary: 'Start a crawl run',
    tag: 'Runs',
    body: 'CreateRunInput',
    response: 'RunSummary',
    status: 201,
  },
  {
    method: 'get',
    path: '/runs/{runId}',
    summary: 'Full run state with every domain',
    tag: 'Runs',
    query: [AT],
    response: 'RunDetail',
  },
  {
    method: 'post',
    path: '/runs/{runId}/actions',
    summary: 'Pause/resume/cancel a run, or act on domains (pause, resume, retry, resolve, skip, assign, note)',
    tag: 'Runs',
    body: 'ActionInput',
    response: 'RunDetail',
  },
  {
    method: 'get',
    path: '/issues',
    summary: 'Blocked domains across runs, oldest first',
    tag: 'Monitor',
    response: ['Issue'],
  },
  { method: 'get', path: '/issues.csv', summary: 'Blocked domains as CSV', tag: 'Export', response: 'csv' },
  {
    method: 'get',
    path: '/domains',
    summary: 'Registry of every domain ever crawled',
    tag: 'Monitor',
    response: ['RegistryEntry'],
  },
  { method: 'get', path: '/domains.csv', summary: 'Domain registry as CSV', tag: 'Export', response: 'csv' },
  {
    method: 'get',
    path: '/graph',
    summary: 'Relationship graph of runs, domains, blockers and countries',
    tag: 'Explore',
    query: [
      {
        name: 'focus',
        description: 'run:<id> | domain:<name> | blocker:<code> | country:<ISO>; two-step neighbourhood',
      },
      AT,
    ],
    response: 'Graph',
  },
  {
    method: 'post',
    path: '/validate',
    summary: 'Clean a pasted domain list and flag domains already in flight',
    tag: 'Runs',
    body: 'ValidateInput',
    response: 'ValidationResult',
  },
  {
    method: 'get',
    path: '/stream',
    summary: 'Server-Sent Events: `pulse` (Pulse) every 2 s and `activity` (CrawlEvent[])',
    tag: 'Monitor',
    response: 'sse',
  },
]

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })

function content(body: Body | [keyof typeof SCHEMAS]) {
  if (Array.isArray(body)) return { 'application/json': { schema: { type: 'array', items: ref(body[0]) } } }
  if (body === 'csv') return { 'text/csv': { schema: { type: 'string' } } }
  if (body === 'sse') return { 'text/event-stream': { schema: { type: 'string' } } }
  if (body === 'html') return { 'text/html': { schema: { type: 'string' } } }
  return { 'application/json': { schema: ref(body) } }
}

export function openApiDocument() {
  const schemas = Object.fromEntries(
    Object.entries(SCHEMAS).map(([name, schema]) => {
      const { $schema: _, ...json } = z.toJSONSchema(schema, {
        io: INPUTS.has(name as keyof typeof SCHEMAS) ? 'input' : 'output',
        unrepresentable: 'any',
      })
      return [name, json]
    }),
  )
  const paths: Record<string, Record<string, unknown>> = {}
  for (const op of OPS) {
    const params = [
      ...(op.path.includes('{runId}')
        ? [{ name: 'runId', in: 'path', required: true, schema: { type: 'string' } }]
        : []),
      ...(op.query ?? []).map((q) => ({
        name: q.name,
        in: 'query',
        description: q.description,
        schema: { type: 'string' },
      })),
      {
        name: 'x-flamer-sandbox',
        in: 'header',
        description: 'Visitor sandbox id. Without it you read and write the shared dataset.',
        schema: { type: 'string', pattern: '^[a-z0-9]{12,40}$' },
      },
    ]
    paths[`/api${op.path}`] ??= {}
    paths[`/api${op.path}`]![op.method] = {
      summary: op.summary,
      tags: [op.tag],
      parameters: params,
      ...(op.body === undefined ? {} : { requestBody: { required: true, content: content(op.body) } }),
      responses: {
        [op.status ?? 200]: { description: 'OK', content: content(op.response) },
        ...(op.body === undefined && op.method === 'get'
          ? {}
          : { 400: { description: 'Invalid input', content: content('ApiError') } }),
        404: { description: 'Not found', content: content('ApiError') },
        409: { description: 'Not possible in the current state', content: content('ApiError') },
      },
    }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Flamer crawl operations API',
      version: '1.0.0',
      description:
        'Simulated crawl backend for the content-ops dashboard. State is a pure function of each run’s spec, its operator actions and the (demo) clock.',
    },
    paths,
    components: { schemas },
  }
}

export const DOCS_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Flamer API</title>
  </head>
  <body>
    <script id="api-reference" data-url="./openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.74.0"></script>
  </body>
</html>
`
