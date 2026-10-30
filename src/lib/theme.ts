import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark' | 'system'

const KEY = 'flamer-theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

const read = (): Theme => {
  try {
    const stored = localStorage.getItem(KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

let theme = read()

const resolved = (): 'light' | 'dark' => (theme === 'system' ? (media.matches ? 'dark' : 'light') : theme)

const apply = () => {
  const dark = resolved() === 'dark'
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  for (const listener of listeners) listener()
}

media.addEventListener('change', apply)
apply()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setTheme(next: Theme) {
  theme = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    return apply()
  }
  apply()
}

export function useTheme() {
  const resolvedTheme = useSyncExternalStore(subscribe, resolved)
  return { theme, resolvedTheme, setTheme }
}
