import { z } from 'zod'

export const RUN_MODES = ['backfill', 'recrawl'] as const
export const PACES = ['gentle', 'standard', 'aggressive'] as const

export const BLOCKERS = ['captcha', 'waf', 'robots', 'login', 'dns', 'tls', 'no_pdfs', 'unstable'] as const
export const REMEDIES = [
  'retry',
  'slow_down',
  'solved_session',
  'request_allowlist',
  'request_permission',
  'add_credentials',
  'allow_insecure',
  'add_entry_point',
] as const
export const OWNER_REMEDIES = ['request_allowlist', 'request_permission'] as const

export const DOMAIN_STATUSES = [
  'queued',
  'discovering',
  'downloading',
  'processing',
  'backing_off',
  'waiting_owner',
  'needs_attention',
  'paused',
  'completed',
  'skipped',
  'cancelled',
] as const

export const REJECT_REASONS = ['not_pdf', 'encrypted', 'corrupted', 'scanned', 'too_large', 'off_topic'] as const

export const RUN_ACTIONS = ['pause_run', 'resume_run', 'cancel_run'] as const
export const DOMAIN_ACTIONS = ['pause', 'resume', 'retry', 'resolve', 'skip', 'assign', 'note'] as const
export const DEMO_SPEEDS = [1, 10, 60] as const

export const ORG_TYPES = ['intergovernmental', 'think_tank', 'ngo', 'government', 'academic', 'unknown'] as const
export const RUN_STATUSES = ['running', 'paused', 'blocked', 'completed', 'cancelled'] as const
export const EVENT_LEVELS = ['info', 'success', 'warn', 'error', 'action'] as const
export const GRAPH_NODE_KINDS = ['run', 'domain', 'blocker', 'country'] as const
export const GRAPH_EDGE_KINDS = ['crawled', 'blocked_by', 'located_in'] as const
export const GRAPH_TONES = ['muted', 'info', 'warn', 'danger', 'success', 'brand'] as const
export const RUNTIMES = ['edge', 'service-worker', 'node', 'node-dev', 'in-page', 'python'] as const
export const STORES = ['memory', 'upstash', 'indexeddb', 'postgres'] as const

export type RunMode = (typeof RUN_MODES)[number]
export type Pace = (typeof PACES)[number]
export type Blocker = (typeof BLOCKERS)[number]
export type Remedy = (typeof REMEDIES)[number]
export type DomainStatus = (typeof DOMAIN_STATUSES)[number]
export type RejectReason = (typeof REJECT_REASONS)[number]
export type RunActionType = (typeof RUN_ACTIONS)[number]
export type DomainActionType = (typeof DOMAIN_ACTIONS)[number]
export type DemoSpeed = (typeof DEMO_SPEEDS)[number]
export type OrgType = (typeof ORG_TYPES)[number]
export type RunStatus = (typeof RUN_STATUSES)[number]
export type EventLevel = (typeof EVENT_LEVELS)[number]
export type GraphNodeKind = (typeof GRAPH_NODE_KINDS)[number]
export type GraphEdgeKind = (typeof GRAPH_EDGE_KINDS)[number]
export type GraphTone = (typeof GRAPH_TONES)[number]

const Actor = z.string().trim().min(1).max(40)
const Millis = z.number().describe('Unix time in milliseconds (demo clock)')

export const RunSettings = z.object({
  concurrency: z.int().min(1).max(16),
  pace: z.enum(PACES),
  respectRobots: z.boolean(),
  recrawlEveryDays: z.int().min(0).max(365).optional().describe('0 or absent: no recurring recrawl'),
})
export type RunSettings = z.infer<typeof RunSettings>

export const CreateRunInput = z.object({
  name: z.string().trim().min(3).max(80),
  mode: z.enum(RUN_MODES),
  settings: RunSettings,
  domains: z.array(z.string()).min(1).max(500),
  actor: Actor.default('You'),
})
export type CreateRunInput = z.input<typeof CreateRunInput>

export const ActionInput = z.discriminatedUnion('type', [
  z.object({
    type: z.enum(RUN_ACTIONS),
    note: z.string().max(280).optional(),
    actor: Actor.default('You'),
  }),
  z.object({
    type: z.enum(DOMAIN_ACTIONS),
    domains: z.array(z.string()).min(1).max(500),
    remedy: z.enum(REMEDIES).optional(),
    assignee: Actor.nullable().optional().describe('assign only: who owns the domain; null unassigns'),
    note: z.string().max(280).optional(),
    actor: Actor.default('You'),
  }),
])
export type ActionInput = z.input<typeof ActionInput>

export const ValidateInput = z.object({ text: z.string().max(200_000) })
export const ValidationResult = z.object({
  valid: z.array(z.string()),
  duplicates: z.array(z.string()),
  invalid: z.array(z.object({ input: z.string(), reason: z.string() })),
  inFlight: z.array(z.object({ domain: z.string(), run: z.string() })),
})
export type ValidationResult = z.infer<typeof ValidationResult>
export const DemoInput = z.object({ speed: z.literal(DEMO_SPEEDS) })

export const RunSpec = z.object({
  id: z.string(),
  name: z.string(),
  mode: z.enum(RUN_MODES),
  settings: RunSettings,
  domains: z.array(z.string()),
  createdAt: Millis,
  createdBy: z.string(),
  seed: z.int(),
})
export type RunSpec = z.infer<typeof RunSpec>

export const RunAction = z.object({
  id: z.string(),
  at: Millis,
  type: z.enum([...RUN_ACTIONS, ...DOMAIN_ACTIONS]),
  actor: z.string(),
  domains: z.array(z.string()).optional(),
  remedy: z.enum(REMEDIES).optional(),
  assignee: z.string().nullable().optional(),
  note: z.string().optional(),
})
export type RunAction = z.infer<typeof RunAction>

export type RunRecord = { spec: RunSpec; actions: RunAction[] }

export const Counters = z.object({
  pages: z.int(),
  pdfsFound: z.int(),
  downloaded: z.int(),
  processed: z.int(),
  published: z.int(),
  updated: z.int(),
  duplicates: z.int(),
  rejected: z.int(),
  rejectReasons: z.record(z.enum(REJECT_REASONS), z.int()),
})
export type Counters = z.infer<typeof Counters>

export const CrawlEvent = z.object({
  at: Millis,
  runId: z.string(),
  runName: z.string(),
  domain: z.string().optional(),
  level: z.enum(EVENT_LEVELS),
  message: z.string(),
})
export type CrawlEvent = z.infer<typeof CrawlEvent>

export const Note = z.object({ at: Millis, actor: z.string(), text: z.string() })
export type Note = z.infer<typeof Note>

export const DomainSnapshot = z.object({
  domain: z.string(),
  status: z.enum(DOMAIN_STATUSES),
  progress: z.number().min(0).max(1),
  attempt: z.int(),
  blocker: z.enum(BLOCKERS).nullable(),
  blockedSince: Millis.nullable(),
  ownerDeclined: z.boolean(),
  remedies: z.array(z.enum(REMEDIES)),
  resumeAt: Millis.nullable(),
  startedAt: Millis.nullable(),
  finishedAt: Millis.nullable(),
  pagesPerMin: z.int(),
  etaSec: z.int().nullable(),
  counters: Counters,
  lastEvent: CrawlEvent.nullable(),
  owner: z.string().nullable(),
  notes: z.array(Note),
})
export type DomainSnapshot = z.infer<typeof DomainSnapshot>

export const StatusCounts = z.record(z.enum(DOMAIN_STATUSES), z.int())
export type StatusCounts = z.infer<typeof StatusCounts>

export const ThroughputPoint = z.object({ t: Millis, pages: z.int(), published: z.int() })
export type ThroughputPoint = z.infer<typeof ThroughputPoint>

export const RunSummary = z.object({
  id: z.string(),
  name: z.string(),
  mode: z.enum(RUN_MODES),
  settings: RunSettings,
  createdAt: Millis,
  createdBy: z.string(),
  status: z.enum(RUN_STATUSES),
  paused: z.boolean(),
  progress: z.number().min(0).max(1),
  domainCount: z.int(),
  statusCounts: StatusCounts,
  attention: z.int(),
  counters: Counters,
  pagesPerMin: z.int(),
  etaSec: z.int().nullable(),
  finishedAt: Millis.nullable(),
})
export type RunSummary = z.infer<typeof RunSummary>

export const RunDetail = RunSummary.extend({
  at: Millis,
  domains: z.array(DomainSnapshot),
  events: z.array(CrawlEvent),
  throughput: z.array(ThroughputPoint),
  actions: z.array(RunAction),
})
export type RunDetail = z.infer<typeof RunDetail>

export const Issue = z.object({
  runId: z.string(),
  runName: z.string(),
  domain: z.string(),
  blocker: z.enum(BLOCKERS),
  since: Millis,
  attempt: z.int(),
  remedies: z.array(z.enum(REMEDIES)),
  ownerDeclined: z.boolean(),
  progress: z.number(),
  owner: z.string().nullable(),
  notes: z.int(),
})
export type Issue = z.infer<typeof Issue>

export const Overview = z.object({
  at: Millis,
  totals: Counters,
  statusCounts: StatusCounts,
  activeRuns: z.int(),
  pagesPerMin: z.int(),
  attention: z.int(),
  throughput: z.array(ThroughputPoint),
  runs: z.array(RunSummary),
  issues: z.array(Issue),
  events: z.array(CrawlEvent),
})
export type Overview = z.infer<typeof Overview>

export const GeoPlace = z.object({
  city: z.string().nullable(),
  country: z.string().describe('ISO 3166-1 alpha-2'),
  countryName: z.string(),
  iso: z.string().describe('ISO 3166-1 numeric, as used by world-atlas'),
  lat: z.number(),
  lon: z.number(),
})
export type GeoPlace = z.infer<typeof GeoPlace>

export const OrgInfo = z.object({ name: z.string().nullable(), type: z.enum(ORG_TYPES), place: GeoPlace.nullable() })
export type OrgInfo = z.infer<typeof OrgInfo>

export const RegistryEntry = z.object({
  domain: z.string(),
  org: OrgInfo,
  runIds: z.array(z.string()),
  runs: z.int(),
  lastRunId: z.string(),
  lastRunName: z.string(),
  lastStatus: z.enum(DOMAIN_STATUSES),
  lastSeen: Millis,
  published: z.int(),
  duplicates: z.int(),
  rejected: z.int(),
  blockers: z.array(z.enum(BLOCKERS)),
  recrawlEveryDays: z.int().nullable(),
  nextRecrawlAt: Millis.nullable(),
})
export type RegistryEntry = z.infer<typeof RegistryEntry>

export const GraphNode = z.object({
  id: z.string(),
  kind: z.enum(GRAPH_NODE_KINDS),
  label: z.string(),
  sub: z.string(),
  tone: z.enum(GRAPH_TONES),
  weight: z.number(),
  depth: z.int().nullable(),
})
export type GraphNode = z.infer<typeof GraphNode>

export const GraphEdge = z.object({
  source: z.string(),
  target: z.string(),
  kind: z.enum(GRAPH_EDGE_KINDS),
  tone: z.enum(GRAPH_TONES),
})
export type GraphEdge = z.infer<typeof GraphEdge>

export const Graph = z.object({
  at: Millis,
  focus: z.string().nullable(),
  nodes: z.array(GraphNode),
  edges: z.array(GraphEdge),
  hidden: z.int(),
})
export type Graph = z.infer<typeof Graph>

export const BackendInfo = z.object({
  runtime: z.enum(RUNTIMES),
  store: z.enum(STORES),
  durable: z.boolean(),
  now: Millis,
})
export type BackendInfo = z.infer<typeof BackendInfo>

export const DemoState = z.object({
  speed: z.literal(DEMO_SPEEDS),
  now: Millis.describe('Current demo-clock time'),
  realNow: Millis,
  sandbox: z.string().nullable().describe('Visitor sandbox id, or null when everyone shares one dataset'),
})
export type DemoState = z.infer<typeof DemoState>

export const Pulse = z.object({
  now: Millis,
  activeRuns: z.int(),
  attention: z.int(),
  pagesPerMin: z.int(),
  runs: z.array(RunSummary.pick({ id: true, status: true, progress: true, attention: true })),
})
export type Pulse = z.infer<typeof Pulse>

export const ApiError = z.object({ error: z.string(), issues: z.unknown().optional() })
export type ApiError = z.infer<typeof ApiError>
