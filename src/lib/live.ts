import { useSyncExternalStore } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import type { CrawlEvent, Pulse } from '@/shared/contract'
import { LIVE_KEYS } from './api'
import { apiFetch } from './backend'

export type LiveState = { status: 'connecting' | 'live' | 'offline'; pulse: Pulse | null }

let state: LiveState = { status: 'connecting', pulse: null }
const listeners = new Set<() => void>()

const set = (next: Partial<LiveState>) => {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const loadedAt = Date.now()

export const useLive = () => useSyncExternalStore(subscribe, () => state)
export const useNow = () => useLive().pulse?.now ?? loadedAt
export const isLive = () => state.status === 'live'

async function* sse(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    let cut: number
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, cut)
      buffer = buffer.slice(cut + 2)
      let event = 'message'
      let data = ''
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7)
        else if (line.startsWith('data: ')) data += line.slice(6)
      }
      if (data.length > 0) yield { event, data }
    }
  }
}

export function startLive(queryClient: QueryClient, onActivity: (events: CrawlEvent[]) => void): () => void {
  const controller = new AbortController()

  const refresh = () =>
    queryClient.invalidateQueries({
      predicate: ({ queryKey }) =>
        (LIVE_KEYS as readonly unknown[]).includes(queryKey[0]) && typeof queryKey[2] !== 'number',
      refetchType: 'active',
    })

  const connect = async () => {
    while (!controller.signal.aborted) {
      try {
        const response = await apiFetch('stream', {
          signal: controller.signal,
          headers: { accept: 'text/event-stream' },
        })
        if (!response.ok || response.body === null) throw new Error(`stream ${response.status}`)
        for await (const { event, data } of sse(response.body)) {
          if (event === 'pulse') {
            set({ status: 'live', pulse: JSON.parse(data) as Pulse })
            void refresh()
          } else if (event === 'activity') onActivity(JSON.parse(data) as CrawlEvent[])
        }
      } catch (error) {
        if (controller.signal.aborted) return
        console.warn('Live stream interrupted', error)
        set({ status: 'offline' })
        await new Promise((r) => setTimeout(r, 3000))
      }
    }
  }

  void connect()
  return () => controller.abort()
}
