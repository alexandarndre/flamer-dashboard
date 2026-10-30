import { StrictMode, Suspense, use, useEffect, useEffectEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { Flame } from 'lucide-react'
import { toast } from 'sonner'
import { backendReady } from '@/lib/backend'
import { isLive, startLive } from '@/lib/live'
import '@/lib/theme'
import type { CrawlEvent } from '@/shared/contract'
import { Toaster } from '@/components/ui/sonner'
import { Spinner } from '@/components/ui/spinner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createAppRouter } from './router'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: () => (isLive() ? false : 5000),
      retry: 1,
    },
  },
})

const router = createAppRouter(queryClient)

function App() {
  use(backendReady)

  const onActivity = useEffectEvent((events: CrawlEvent[]) => {
    const notable = events.filter(
      (e) => e.domain !== undefined && (e.level === 'error' || e.message.startsWith('Publisher')),
    )
    for (const e of notable.slice(-3)) {
      const open = () =>
        router.navigate({ to: '/runs/$runId', params: { runId: e.runId }, search: { domain: e.domain } })
      const options = { description: `${e.message} · ${e.runName}`, action: { label: 'Review', onClick: open } }
      if (e.level === 'error') toast.warning(`${e.domain} needs attention`, options)
      else toast.success(e.domain!, options)
    }
  })

  useEffect(() => startLive(queryClient, onActivity), [])

  return <RouterProvider router={router} />
}

function BootScreen() {
  return (
    <div className="grid min-h-svh place-items-center">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <div className="flex size-9 items-center justify-center rounded-xl bg-brand text-white">
          <Flame className="size-5" />
        </div>
        <Spinner /> Starting the crawl backend…
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <Suspense fallback={<BootScreen />}>
          <App />
        </Suspense>
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
)
