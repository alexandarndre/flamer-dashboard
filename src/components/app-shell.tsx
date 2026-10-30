import { Suspense, lazy, useEffect, useState } from 'react'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Flame,
  Globe,
  Hand,
  LayoutDashboard,
  ListChecks,
  Moon,
  Plus,
  Search,
  Server,
  Sun,
  Waypoints,
} from 'lucide-react'
import { queries } from '@/lib/api'
import { apiUrl, transport } from '@/lib/backend'
import { sandboxId } from '@/lib/identity'
import { short } from '@/lib/format'
import { useLive } from '@/lib/live'
import { useTheme } from '@/lib/theme'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CommandMenu } from './command-menu'
import { DemoCenter, OperatorMenu, Tour } from './demo-center'
import { Dot } from './status'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/runs', label: 'Crawl runs', icon: ListChecks },
  { to: '/issues', label: 'Needs attention', icon: Hand },
  { to: '/domains', label: 'Domains', icon: Globe },
  { to: '/explore', label: 'Explore', icon: Waypoints },
] as const

const SidebarMap = lazy(() => import('./sidebar-map').then((m) => ({ default: m.SidebarMap })))

const RUNTIME_LABEL = {
  edge: 'Vercel Edge Function',
  'service-worker': 'Service Worker',
  node: 'Node.js server',
  'node-dev': 'Vite dev server',
  'in-page': 'In-page fallback',
  python: 'Python (FastAPI)',
} as const

const STORE_LABEL = {
  memory: 'in-memory',
  upstash: 'Upstash Redis',
  indexeddb: 'IndexedDB',
  postgres: 'PostgreSQL',
} as const

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const live = useLive()
  const { data: runs } = useQuery(queries.runs())
  const { data: backend } = useQuery(queries.health())
  const [commandOpen, setCommandOpen] = useState(false)
  const attention = live.pulse?.attention ?? 0

  useEffect(() => {
    document.title = attention > 0 ? `(${attention}) Flamer · Crawl operations` : 'Flamer · Crawl operations'
  }, [attention])

  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to))
  const activeRuns = (runs ?? []).filter(
    (r) => r.status === 'running' || r.status === 'paused' || r.status === 'blocked',
  )

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to="/">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-brand text-white shadow-sm">
                    <Flame className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="font-semibold">Flamer</span>
                    <span className="text-xs text-muted-foreground">Crawl operations</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Operate</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive(item.to)} tooltip={item.label}>
                      <Link to={item.to}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.to === '/issues' && attention > 0 && (
                      <SidebarMenuBadge className="bg-danger/15 text-danger">{attention}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          {pathname !== '/explore' && (
            <Suspense fallback={<Skeleton className="mx-3 my-2 aspect-[2/1] group-data-[collapsible=icon]:hidden" />}>
              <SidebarMap />
            </Suspense>
          )}
          {activeRuns.length > 0 && (
            <SidebarGroup className="group-data-[collapsible=icon]:hidden">
              <SidebarGroupLabel>In progress</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {activeRuns.map((run) => (
                    <SidebarMenuItem key={run.id}>
                      <SidebarMenuButton asChild isActive={pathname === `/runs/${run.id}`} className="h-auto py-1.5">
                        <Link to="/runs/$runId" params={{ runId: run.id }}>
                          <div className="grid w-full gap-1">
                            <div className="flex items-center gap-2">
                              <Dot
                                tone={run.status === 'blocked' ? 'danger' : run.status === 'paused' ? 'muted' : 'info'}
                                pulse={run.status === 'running'}
                              />
                              <span className="truncate text-xs">{run.name}</span>
                            </div>
                            <div className="ml-4 h-1 overflow-hidden rounded-full bg-sidebar-accent">
                              <div
                                className="h-full bg-brand transition-[width] duration-700"
                                style={{ width: `${run.progress * 100}%` }}
                              />
                            </div>
                          </div>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>
        <SidebarFooter>
          <div className="grid gap-1.5 rounded-lg border bg-background/60 p-2.5 text-xs group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-2 font-medium">
              <Dot
                tone={live.status === 'live' ? 'success' : live.status === 'offline' ? 'danger' : 'warn'}
                pulse={live.status === 'live'}
              />
              {live.status === 'live' ? 'Live updates' : live.status === 'offline' ? 'Reconnecting…' : 'Connecting…'}
            </div>
            {backend !== undefined && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <Server className="mt-0.5 size-3 shrink-0" />
                <span>
                  {RUNTIME_LABEL[backend.runtime]} · {STORE_LABEL[backend.store]}
                  {!backend.durable && ' (resets on cold start)'}
                  {transport() === 'in-page' && ' · service worker bypassed'}
                </span>
              </div>
            )}
            <a
              href={`${apiUrl('docs')}?sandbox=${sandboxId}`}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              API docs (OpenAPI) ↗
            </a>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 rounded-t-xl border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <Button
            variant="outline"
            className="h-8 justify-start gap-2 text-muted-foreground sm:w-full sm:max-w-72"
            aria-label="Search"
            onClick={() => setCommandOpen(true)}
          >
            <Search />
            <span className="hidden flex-1 text-left sm:inline">Jump to a run or domain…</span>
            <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {live.pulse !== null && live.pulse.pagesPerMin > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="hidden items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground tabular-nums sm:flex">
                    <Dot tone="info" pulse />
                    {short(live.pulse.pagesPerMin)} pages/min
                  </div>
                </TooltipTrigger>
                <TooltipContent>Combined crawl speed across all active runs</TooltipContent>
              </Tooltip>
            )}
            <DemoCenter />
            <ThemeToggle />
            <OperatorMenu />
            <Button size="sm" asChild>
              <Link to="/runs/new">
                <Plus />
                <span className="hidden sm:inline">New crawl</span>
              </Link>
            </Button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">
          {backend?.runtime === 'edge' && !backend.durable && (
            <p className="mx-auto mb-4 max-w-7xl rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
              This deployment has no Redis connected, so runs live in one edge instance’s memory and can reset or go
              missing. Connect Upstash Redis in Vercel to make them persistent.
            </p>
          )}
          <Outlet />
        </main>
      </SidebarInset>
      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />
      <Tour />
    </SidebarProvider>
  )
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )
}
