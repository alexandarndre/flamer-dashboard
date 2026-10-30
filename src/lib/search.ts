import { DOMAIN_STATUSES } from '@/shared/contract'

export const RUN_TABS = ['domains', 'issues', 'activity', 'documents'] as const
export const RUN_FILTERS = ['all', 'active', 'attention', 'finished'] as const
export const DOMAIN_FILTERS = ['all', 'active', 'attention', 'waiting', 'done', ...DOMAIN_STATUSES] as const

export type RunTab = (typeof RUN_TABS)[number]
export type RunFilter = (typeof RUN_FILTERS)[number]

export const WHO_FILTERS = ['all', 'mine', 'unassigned', 'overdue'] as const
export type Who = (typeof WHO_FILTERS)[number]
