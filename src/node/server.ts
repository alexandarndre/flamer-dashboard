import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { createApp } from '../server/app'
import { memoryStores } from '../server/store/memory'
import { upstashStores } from '../server/store/upstash'

const redisUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
const redisToken = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN

const api = createApp({
  runtime: 'node',
  stores: redisUrl !== undefined && redisToken !== undefined ? upstashStores(redisUrl, redisToken) : memoryStores(),
  sandboxes: process.env.FLAMER_SANDBOXES !== 'off',
})

const app = new Hono()
  .all('/api/*', (c) => api(c.req.raw))
  .use(
    '/assets/*',
    serveStatic({
      root: './dist',
      onFound: (_path, c) => c.header('cache-control', 'public, max-age=31536000, immutable'),
    }),
  )
  .use('/*', serveStatic({ root: './dist' }))
  .get('*', serveStatic({ path: './dist/index.html' }))

const server = serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, (info) =>
  console.log(`Flamer listening on http://localhost:${info.port}`),
)

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    server.close(() => process.exit(0))
    if ('closeAllConnections' in server) server.closeAllConnections()
  })
