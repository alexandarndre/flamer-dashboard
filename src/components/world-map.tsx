import { use, useState, type KeyboardEvent } from 'react'
import { geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import { cn } from '@/lib/utils'
import { num, plural } from '@/lib/format'
import { STATUS_INFO, type Tone } from '@/shared/catalog'
import type { DomainStatus, GeoPlace, OrgInfo } from '@/shared/contract'
import { TONE_BG } from './status'

const W = 960
const H = 470

const shapes = import('world-atlas/countries-110m.json').then(({ default: topology }) => {
  const countries = feature(topology, topology.objects.countries).features.filter((f) => f.id !== '010')
  const projection = geoNaturalEarth1().fitExtent(
    [
      [6, 6],
      [W - 6, H - 6],
    ],
    { type: 'FeatureCollection', features: countries },
  )
  const path = geoPath(projection)
  return {
    countries: countries.map((f) => ({ iso: String(f.id), name: f.properties.name, d: path(f) ?? '' })),
    project: (place: GeoPlace) => projection([place.lon, place.lat]) ?? [0, 0],
  }
})

export type MapItem = { domain: string; status: DomainStatus; docs: number; org: OrgInfo }

export type MapCluster = {
  key: string
  place: GeoPlace
  items: MapItem[]
  docs: number
  tone: Tone
  x: number
  y: number
}

const TONE_RANK: Record<Tone, number> = { danger: 4, warn: 3, info: 2, success: 1, muted: 0 }
const FILL: Record<Tone, string> = {
  danger: 'fill-danger',
  warn: 'fill-warn',
  info: 'fill-info',
  success: 'fill-success',
  muted: 'fill-idle',
}
const STROKE: Record<Tone, string> = {
  danger: 'stroke-danger',
  warn: 'stroke-warn',
  info: 'stroke-info',
  success: 'stroke-success',
  muted: 'stroke-idle',
}

export function WorldMap({
  items,
  compact = false,
  highlight,
  selectedCountry,
  onSelect,
  onSelectCountry,
  className,
}: {
  items: MapItem[]
  compact?: boolean
  highlight?: string
  selectedCountry?: string
  onSelect?: (cluster: MapCluster) => void
  onSelectCountry?: (iso2: string) => void
  className?: string
}) {
  const { countries, project } = use(shapes)
  const [hover, setHover] = useState<MapCluster | null>(null)

  const byPlace = new Map<string, MapCluster>()
  const perCountry = new Map<string, { cc: string; count: number }>()
  for (const item of items) {
    const place = item.org.place
    if (place === null) continue
    const key = `${place.lat},${place.lon}`
    const tone = STATUS_INFO[item.status].tone
    const [x, y] = project(place)
    const cluster = byPlace.get(key) ?? { key, place, items: [], docs: 0, tone, x, y }
    cluster.items.push(item)
    cluster.docs += item.docs
    if (TONE_RANK[tone] > TONE_RANK[cluster.tone]) cluster.tone = tone
    byPlace.set(key, cluster)
    const country = perCountry.get(place.iso) ?? { cc: place.country, count: 0 }
    country.count += 1
    perCountry.set(place.iso, country)
  }
  const clusters = [...byPlace.values()].toSorted((a, b) => b.items.length - a.items.length)
  const maxCount = Math.max(1, ...[...perCountry.values()].map((c) => c.count))
  const maxDocs = Math.max(1, ...clusters.map((c) => c.docs))
  const unplaced = items.length - clusters.reduce((n, c) => n + c.items.length, 0)
  const radius = (c: MapCluster) =>
    compact ? 9 + Math.sqrt(c.items.length) * 7 : 5 + Math.sqrt(c.items.length) * 3 + Math.sqrt(c.docs / maxDocs) * 10
  const focused = (c: MapCluster) => highlight === undefined || c.items.some((i) => i.domain === highlight)

  return (
    <div className={cn('relative', className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Map of crawled sources">
        {countries.map((c) => {
          const stats = perCountry.get(c.iso)
          return (
            <path
              key={c.iso + c.name}
              d={c.d}
              className={cn(
                'stroke-background transition-[fill-opacity]',
                stats === undefined ? 'fill-muted-foreground/15' : 'fill-brand',
                onSelectCountry !== undefined && stats !== undefined && 'cursor-pointer hover:fill-brand/90',
                selectedCountry !== undefined && stats?.cc === selectedCountry && 'stroke-foreground',
              )}
              strokeWidth={compact ? 1.5 : 0.6}
              fillOpacity={stats === undefined ? undefined : 0.18 + 0.5 * (stats.count / maxCount)}
              onClick={stats === undefined ? undefined : () => onSelectCountry?.(stats.cc)}
            >
              <title>{stats === undefined ? c.name : `${c.name}: ${plural(stats.count, 'source')}`}</title>
            </path>
          )
        })}
        {clusters.map((c) => (
          <g
            key={c.key}
            className={cn('transition-opacity outline-none', onSelect !== undefined && 'cursor-pointer')}
            opacity={focused(c) ? 1 : 0.3}
            onClick={() => onSelect?.(c)}
            onMouseEnter={() => setHover(c)}
            onMouseLeave={() => setHover(null)}
            {...(onSelect === undefined
              ? {}
              : {
                  role: 'button',
                  tabIndex: 0,
                  'aria-label': `${c.place.city ?? c.place.countryName}: ${plural(c.items.length, 'source')}`,
                  onFocus: () => setHover(c),
                  onBlur: () => setHover(null),
                  onKeyDown: (e: KeyboardEvent) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return
                    e.preventDefault()
                    onSelect(c)
                  },
                })}
          >
            {highlight !== undefined && focused(c) && (
              <circle
                cx={c.x}
                cy={c.y}
                r={radius(c) + (compact ? 10 : 6)}
                className={cn('fill-none', STROKE[c.tone])}
                strokeWidth={compact ? 4 : 2}
              />
            )}
            <circle
              cx={c.x}
              cy={c.y}
              r={radius(c)}
              className={cn(FILL[c.tone], 'stroke-background')}
              fillOpacity={0.85}
              strokeWidth={compact ? 4 : 1.5}
            >
              <title>{`${c.place.city ?? c.place.countryName}: ${c.items.map((i) => i.domain).join(', ')}`}</title>
            </circle>
          </g>
        ))}
      </svg>
      {!compact && hover !== null && (
        <div className="pointer-events-none absolute top-2 left-2 max-w-72 rounded-lg border bg-popover/95 p-3 text-xs shadow-md backdrop-blur">
          <div className="font-medium">
            {hover.place.city ?? 'Somewhere in'}{' '}
            {hover.place.city === null ? hover.place.countryName : `· ${hover.place.countryName}`}
          </div>
          <div className="mb-1.5 text-muted-foreground">
            {plural(hover.items.length, 'source')} · {num(hover.docs)} documents
          </div>
          <ul className="grid gap-0.5">
            {hover.items.slice(0, 8).map((i) => (
              <li key={i.domain} className="flex items-center gap-1.5">
                <span className={cn('size-1.5 rounded-full', TONE_BG[STATUS_INFO[i.status].tone])} />
                <span className="truncate">{i.org.name ?? i.domain}</span>
                <span className="ml-auto text-muted-foreground">{STATUS_INFO[i.status].label}</span>
              </li>
            ))}
            {hover.items.length > 8 && <li className="text-muted-foreground">+{hover.items.length - 8} more</li>}
          </ul>
        </div>
      )}
      {unplaced > 0 && !compact && (
        <p className="absolute right-2 bottom-1 text-xs text-muted-foreground">
          {plural(unplaced, 'source')} without a known location
        </p>
      )}
    </div>
  )
}

export function summarizeMap(items: MapItem[]) {
  const placed = items.filter((i) => i.org.place !== null)
  return {
    sources: items.length,
    countries: new Set(placed.map((i) => i.org.place!.country)).size,
    unplaced: items.length - placed.length,
  }
}
