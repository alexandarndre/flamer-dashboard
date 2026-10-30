import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, ViteDevServer } from 'vite'
import type { Stores } from './src/server/store/types.ts'

type AppModule = typeof import('./src/server/app.ts')
type MemoryModule = typeof import('./src/server/store/memory.ts')

export function apiPlugin(): Plugin {
  let stores: Stores | undefined

  const handle = async (server: ViteDevServer, req: IncomingMessage, res: ServerResponse) => {
    const { createApp } = (await server.ssrLoadModule('/src/server/app.ts')) as AppModule
    const { memoryStores } = (await server.ssrLoadModule('/src/server/store/memory.ts')) as MemoryModule
    stores ??= memoryStores()
    const controller = new AbortController()
    res.on('close', () => controller.abort())
    const chunks: Buffer[] = []
    if (req.method !== 'GET' && req.method !== 'HEAD') for await (const chunk of req) chunks.push(chunk as Buffer)
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers))
      if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
    const response = await createApp({ runtime: 'node-dev', stores })(
      new Request(new URL(req.url!, `http://${req.headers.host ?? 'localhost'}`), {
        method: req.method,
        headers,
        body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
        signal: controller.signal,
      }),
    )
    res.statusCode = response.status
    response.headers.forEach((value, key) => res.setHeader(key, value))
    res.flushHeaders()
    if (response.body !== null)
      for await (const chunk of response.body) {
        if (res.destroyed) break
        res.write(chunk)
      }
    res.end()
  }

  return {
    name: 'flamer-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === undefined || !/^\/api(\/|$|\?)/.test(req.url)) return next()
        handle(server, req, res).catch((error: unknown) => (res.destroyed ? undefined : next(error)))
      })
    },
  }
}
