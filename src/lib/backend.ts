import { sandboxId } from './identity'

export type Transport = 'network' | 'service-worker' | 'in-page'

const BASE = import.meta.env.BASE_URL
let send: (url: string, init?: RequestInit) => Promise<Response> = (url, init) => fetch(url, init)
let active: Transport = 'network'

export const apiUrl = (path: string) => `${BASE}api/${path}`

export const apiFetch = (path: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers)
  headers.set('x-flamer-sandbox', sandboxId)
  return send(apiUrl(path), { ...init, headers })
}
export const transport = () => active

function controlled(timeoutMs: number): Promise<boolean> {
  if (navigator.serviceWorker.controller !== null) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs)
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        clearTimeout(timer)
        resolve(true)
      },
      { once: true },
    )
  })
}

async function boot(): Promise<Transport> {
  if (import.meta.env.VITE_BACKEND !== 'sw') return 'network'
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE })
      await navigator.serviceWorker.ready
      if (await controlled(3000)) return 'service-worker'
    } catch (error) {
      console.warn('Service worker unavailable, running the API in the page instead', error)
    }
  }
  const [{ createApp }, { indexedDbStore }] = await Promise.all([
    import('@/server/app'),
    import('@/server/store/indexeddb'),
  ])
  const store = indexedDbStore()
  const app = createApp({ runtime: 'in-page', stores: () => store, sandboxes: false })
  send = (url, init) => app(new Request(new URL(url, location.href), init))
  return 'in-page'
}

export const backendReady: Promise<Transport> = boot().then((t) => (active = t))
