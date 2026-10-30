import { createApp } from '../src/server/app'
import { memoryStores } from '../src/server/store/memory'
import { upstashStores } from '../src/server/store/upstash'

export const config = { runtime: 'edge' }

const redisUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
const redisToken = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN

const app = createApp({
  runtime: 'edge',
  stores: redisUrl !== undefined && redisToken !== undefined ? upstashStores(redisUrl, redisToken) : memoryStores(),
  sandboxes: process.env.FLAMER_SANDBOXES !== 'off',
})

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const route = url.searchParams.get('route')
  if (route === null) return app(request)
  url.pathname = `/api/${route}`
  url.searchParams.delete('route')
  const init: RequestInit = { method: request.method, headers: request.headers, signal: request.signal }
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = await request.arrayBuffer()
  return app(new Request(url, init))
}
