import { describe, expect, it } from 'vitest'
import { buildGraph } from '../src/server/graph'
import { seedRecords } from '../src/server/seed'
import { simulateRun } from '../src/server/sim/engine'
import { orgOf } from '../src/shared/geo'

const NOW = Date.UTC(2026, 9, 29, 12, 0)
const details = seedRecords(NOW).map((r) => simulateRun(r, NOW))

describe('orgOf', () => {
  it('places known organisations at their headquarters', () => {
    expect(orgOf('who.int')).toMatchObject({ name: 'World Health Organization', type: 'intergovernmental' })
    expect(orgOf('who.int').place).toMatchObject({ city: 'Geneva', country: 'CH', iso: '756' })
  })

  it('falls back to the country from the domain suffix', () => {
    expect(orgOf('statistik.at')).toMatchObject({ type: 'unknown', place: { country: 'AT', city: null } })
    expect(orgOf('gov.wales.gov.uk')).toMatchObject({ type: 'government', place: { country: 'GB' } })
    expect(orgOf('epa.gov')).toMatchObject({ type: 'government', place: { country: 'US' } })
    expect(orgOf('unido.int')).toEqual({ name: null, type: 'intergovernmental', place: null })
  })

  it('leaves generic domains unplaced', () => {
    expect(orgOf('some-ngo.org').place).toBeNull()
  })
})

describe('buildGraph', () => {
  it('connects runs, domains, blockers and countries', () => {
    const graph = buildGraph(details, null, NOW)!
    const kinds = new Set(graph.nodes.map((n) => n.kind))
    expect([...kinds].toSorted()).toEqual(['blocker', 'country', 'domain', 'run'])
    const ids = new Set(graph.nodes.map((n) => n.id))
    for (const e of graph.edges) expect(ids.has(e.source) && ids.has(e.target)).toBe(true)
    expect(graph.edges.some((e) => e.source === 'domain:who.int' && e.target === 'country:CH')).toBe(true)
  })

  it('extracts a two-step neighbourhood around the focus', () => {
    const graph = buildGraph(details, 'domain:who.int', NOW)!
    const focus = graph.nodes.find((n) => n.id === 'domain:who.int')!
    expect(focus.depth).toBe(0)
    const depth1 = graph.nodes.filter((n) => n.depth === 1).map((n) => n.id)
    expect(depth1).toContain('run:run_igo_weekly')
    expect(depth1).toContain('country:CH')
    expect(graph.nodes.some((n) => n.id === 'domain:wto.org' && n.depth === 2)).toBe(true)
    expect(graph.nodes.every((n) => n.depth !== null && n.depth <= 2)).toBe(true)
  })

  it('returns null for an unknown focus', () => {
    expect(buildGraph(details, 'domain:nowhere.example', NOW)).toBeNull()
  })
})
