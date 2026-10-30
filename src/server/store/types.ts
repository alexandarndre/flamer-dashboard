import type { BackendInfo, DemoSpeed, RunAction, RunRecord, RunSpec } from '../../shared/contract'

export type Clock = { anchorReal: number; anchorSim: number; speed: DemoSpeed }

export interface Store {
  readonly kind: BackendInfo['store']
  readonly durable: boolean
  list(): Promise<RunRecord[]>
  get(id: string): Promise<RunRecord | null>
  create(spec: RunSpec): Promise<void>
  append(id: string, actions: RunAction[]): Promise<void>
  seedOnce(make: () => RunRecord[]): Promise<void>
  getClock(): Promise<Clock | null>
  setClock(clock: Clock): Promise<void>
  reset(): Promise<void>
}

export const SHARED = 'shared'

export type Stores = (namespace: string) => Store
