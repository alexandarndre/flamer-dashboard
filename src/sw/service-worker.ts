import { createApp } from '../server/app'
import { indexedDbStore } from '../server/store/indexeddb'

const sw = self as unknown as ServiceWorkerGlobalScope
const store = indexedDbStore()
const app = createApp({ runtime: 'service-worker', stores: () => store, sandboxes: false })
const scope = new URL(sw.registration.scope).pathname

sw.addEventListener('install', () => void sw.skipWaiting())
sw.addEventListener('activate', (event) => event.waitUntil(sw.clients.claim()))
sw.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== sw.location.origin || !url.pathname.startsWith(scope)) return
  if (url.pathname.startsWith(`${scope}api/`)) event.respondWith(app(event.request))
  else if (event.request.mode === 'navigate' && !/\.\w+$/.test(url.pathname))
    event.respondWith(fetch(`${scope}index.html`).catch(() => fetch(event.request)))
})
