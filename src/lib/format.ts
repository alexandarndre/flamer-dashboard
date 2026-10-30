const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const whole = new Intl.NumberFormat('en-US')
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' })
const clockFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
const clockSecFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export const num = (n: number) => whole.format(n)
export const short = (n: number) => compact.format(n)
export const pct = (x: number) => `${Math.round(x * 100)}%`
export const clock = (t: number) => clockFmt.format(t)
export const clockSec = (t: number) => clockSecFmt.format(t)
export const dateTime = (t: number) => dateTimeFmt.format(t)

export function ago(t: number, now = Date.now()): string {
  const sec = Math.round((t - now) / 1000)
  const abs = Math.abs(sec)
  if (abs < 45) return 'just now'
  if (abs < 3600) return relative.format(Math.round(sec / 60), 'minute')
  if (abs < 86_400) return relative.format(Math.round(sec / 3600), 'hour')
  return relative.format(Math.round(sec / 86_400), 'day')
}

export function duration(sec: number): string {
  if (sec < 60) return `${Math.max(1, Math.round(sec))}s`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`
}

export const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`
