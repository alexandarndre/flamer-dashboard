import { useSyncExternalStore } from 'react'

const NAME_KEY = 'flamer-name'
const SANDBOX_KEY = 'flamer-sandbox'
const listeners = new Set<() => void>()

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    return
  }
}

let name = read(NAME_KEY) ?? 'You'

export const operatorName = () => name

export function setOperatorName(next: string) {
  name = next.trim() === '' ? 'You' : next.trim().slice(0, 40)
  write(NAME_KEY, name)
  for (const listener of listeners) listener()
}

export const useOperatorName = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => name,
  )

const existing = read(SANDBOX_KEY)
export const sandboxId =
  existing !== null && /^[a-z0-9]{12,40}$/.test(existing)
    ? existing
    : crypto.randomUUID().replaceAll('-', '').slice(0, 24)
if (existing !== sandboxId) write(SANDBOX_KEY, sandboxId)
