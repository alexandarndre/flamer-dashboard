import { createRootRouteWithContext, createRoute, createRouter, lazyRouteComponent, Link } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { queries } from '@/lib/api'
import { DOMAIN_FILTERS, RUN_FILTERS, RUN_TABS, WHO_FILTERS } from '@/lib/search'
import { BLOCKERS, RUN_MODES } from '@/shared/contract'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: AppShell,
  notFoundComponent: () => (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Page not found</EmptyTitle>
        <EmptyDescription>The link may be old, or the run was created in another browser.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link to="/">Back to overview</Link>
        </Button>
      </EmptyContent>
    </Empty>
  ),
  errorComponent: ({ error, reset }) => (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Something went wrong</EmptyTitle>
        <EmptyDescription>{error instanceof Error ? error.message : String(error)}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={reset}>Try again</Button>
      </EmptyContent>
    </Empty>
  ),
})

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: ({ context }) => context.queryClient.ensureQueryData(queries.overview()),
  component: lazyRouteComponent(() => import('@/pages/overview'), 'OverviewPage'),
})

const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'runs',
  validateSearch: z.object({ filter: z.enum(RUN_FILTERS).optional().catch(undefined) }),
  loader: ({ context }) => context.queryClient.ensureQueryData(queries.runs()),
  component: lazyRouteComponent(() => import('@/pages/runs'), 'RunsPage'),
})

const newRunRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'runs/new',
  validateSearch: z.object({
    domains: z.string().optional().catch(undefined),
    mode: z.enum(RUN_MODES).optional().catch(undefined),
  }),
  component: lazyRouteComponent(() => import('@/pages/new-run'), 'NewRunPage'),
})

const runRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'runs/$runId',
  validateSearch: z.object({
    tab: z.enum(RUN_TABS).optional().catch(undefined),
    filter: z.enum(DOMAIN_FILTERS).optional().catch(undefined),
    q: z.string().optional().catch(undefined),
    at: z.number().int().positive().optional().catch(undefined),
    domain: z.string().optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ at: search.at }),
  loader: ({ context, params, deps }) => context.queryClient.ensureQueryData(queries.run(params.runId, deps.at)),
  component: lazyRouteComponent(() => import('@/pages/run'), 'RunPage'),
})

const issuesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'issues',
  validateSearch: z.object({
    blocker: z.enum(BLOCKERS).optional().catch(undefined),
    who: z.enum(WHO_FILTERS).optional().catch(undefined),
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(queries.issues()),
  component: lazyRouteComponent(() => import('@/pages/issues'), 'IssuesPage'),
})

const domainsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'domains',
  validateSearch: z.object({
    q: z.string().optional().catch(undefined),
    due: z.boolean().optional().catch(undefined),
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(queries.domains()),
  component: lazyRouteComponent(() => import('@/pages/domains'), 'DomainsPage'),
})

const exploreRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'explore',
  validateSearch: z.object({ focus: z.string().optional().catch(undefined) }),
  loaderDeps: ({ search }) => ({ focus: search.focus }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(queries.domains()),
      context.queryClient.ensureQueryData(queries.graph(deps.focus)).catch(() => undefined),
    ]),
  component: lazyRouteComponent(() => import('@/pages/explore'), 'ExplorePage'),
})

const routeTree = rootRoute.addChildren([
  overviewRoute,
  runsRoute,
  newRunRoute,
  runRoute,
  issuesRoute,
  domainsRoute,
  exploreRoute,
])

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    basepath: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultViewTransition: true,
    scrollRestoration: true,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
