import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import type {
  ActionInput,
  ApiError,
  BackendInfo,
  CreateRunInput,
  DemoSpeed,
  DemoState,
  Graph,
  Issue,
  Overview,
  RegistryEntry,
  RunDetail,
  RunSummary,
  ValidationResult,
} from '@/shared/contract'
import { apiFetch } from './backend'

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: unknown,
  ) {
    super(message)
  }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await apiFetch(
    path,
    body === undefined
      ? undefined
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
  )
  const data: unknown = await response.json()
  if (!response.ok) {
    const error = data as ApiError
    throw new ApiRequestError(response.status, error.error, error.issues)
  }
  return data as T
}

export const api = {
  createRun: (input: CreateRunInput) => call<RunSummary>('runs', input),
  act: (runId: string, input: ActionInput) => call<RunDetail>(`runs/${runId}/actions`, input),
  validate: (text: string) => call<ValidationResult>('validate', { text }),
  setSpeed: (speed: DemoSpeed) => call<DemoState>('demo', { speed }),
  reset: () => call<DemoState>('demo/reset', {}),
  download: async (path: string, filename: string) => {
    const response = await apiFetch(path)
    if (!response.ok) throw new ApiRequestError(response.status, `Export failed (${response.status})`)
    const link = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(await response.blob()),
      download: filename,
    })
    link.click()
    URL.revokeObjectURL(link.href)
  },
}

export const LIVE_KEYS = ['overview', 'runs', 'run', 'issues', 'domains', 'graph'] as const

export const queries = {
  health: () => queryOptions({ queryKey: ['health'], queryFn: () => call<BackendInfo>('health'), staleTime: Infinity }),
  demo: () => queryOptions({ queryKey: ['demo'], queryFn: () => call<DemoState>('demo'), refetchInterval: 15_000 }),
  overview: () => queryOptions({ queryKey: ['overview'], queryFn: () => call<Overview>('overview') }),
  runs: () => queryOptions({ queryKey: ['runs'], queryFn: () => call<RunSummary[]>('runs') }),
  run: (id: string, at?: number) =>
    queryOptions({
      queryKey: ['run', id, at ?? 'live'],
      queryFn: () => call<RunDetail>(`runs/${id}${at === undefined ? '' : `?at=${at}`}`),
      placeholderData: keepPreviousData,
      staleTime: at === undefined ? 0 : Infinity,
    }),
  issues: () => queryOptions({ queryKey: ['issues'], queryFn: () => call<Issue[]>('issues') }),
  domains: () => queryOptions({ queryKey: ['domains'], queryFn: () => call<RegistryEntry[]>('domains') }),
  graph: (focus?: string) =>
    queryOptions({
      queryKey: ['graph', focus ?? 'all'],
      queryFn: () => call<Graph>(`graph${focus === undefined ? '' : `?focus=${encodeURIComponent(focus)}`}`),
      placeholderData: keepPreviousData,
    }),
}
