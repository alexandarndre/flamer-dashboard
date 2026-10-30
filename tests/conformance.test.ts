import { expect, it } from 'vitest'
import { overviewOf, registryOf, simulateAll } from '../src/server/aggregate'
import { buildGraph } from '../src/server/graph'
import { seedRecords } from '../src/server/seed'
import { simulateRun } from '../src/server/sim/engine'
import type { RunAction, RunRecord } from '../src/shared/contract'
import { parseDomainList } from '../src/shared/domains'
import { orgOf } from '../src/shared/geo'

const NOW = Date.UTC(2026, 9, 29, 12, 0)
const MIN = 60_000

const act = (n: number, at: number, a: Omit<RunAction, 'id' | 'at' | 'actor'>): RunAction => ({
  id: `act_${n}`,
  at,
  actor: 'Tester',
  ...a,
})

const scripted: RunRecord = {
  spec: {
    id: 'run_scripted',
    name: 'Scripted operator session',
    mode: 'backfill',
    settings: { concurrency: 3, pace: 'aggressive', respectRobots: true, recrawlEveryDays: 30 },
    domains: ['who.int', 'ecb.europa.eu', 'sipri.org', 'wri.org', 'imf.org', 'statistik.at', 'unicef.org'],
    createdAt: NOW - 90 * MIN,
    createdBy: 'Tester',
    seed: 1234567,
  },
  actions: [
    act(1, NOW - 89 * MIN, { type: 'pause', domains: ['wri.org'] }),
    act(2, NOW - 75 * MIN, { type: 'pause_run' }),
    act(3, NOW - 70 * MIN, { type: 'resume_run' }),
    act(4, NOW - 84 * MIN, { type: 'resume', domains: ['wri.org'] }),
    act(5, NOW - 60 * MIN, { type: 'assign', domains: ['who.int'], assignee: 'Maya R.' }),
    act(6, NOW - 55 * MIN, { type: 'resolve', domains: ['who.int'], remedy: 'solved_session' }),
    act(7, NOW - 50 * MIN, { type: 'resolve', domains: ['ecb.europa.eu'], remedy: 'request_permission' }),
    act(8, NOW - 45 * MIN, { type: 'resolve', domains: ['sipri.org'], remedy: 'add_entry_point' }),
    act(9, NOW - 40 * MIN, { type: 'note', domains: ['imf.org'], note: 'Their CDN is flaky on Fridays' }),
    act(10, NOW - 35 * MIN, { type: 'skip', domains: ['statistik.at'], note: 'Out of scope' }),
  ],
}

it('matches the golden engine output shared with the Python backend', async () => {
  const seeds = seedRecords(NOW)
  const records = [...seeds, scripted]
  const details = simulateAll(records, NOW)
  const golden = {
    now: NOW,
    records,
    runs: [
      ...records.flatMap((r) => [NOW - 30 * MIN, NOW].map((at) => ({ id: r.spec.id, at, detail: simulateRun(r, at) }))),
    ],
    overview: overviewOf(details, NOW),
    registry: registryOf(details),
    graphs: [null, 'run:run_igo_weekly', 'domain:who.int', 'country:CH', 'blocker:captcha'].map((focus) => ({
      focus,
      graph: buildGraph(details, focus, NOW),
    })),
    orgs: ['who.int', 'statistik.at', 'epa.gov', 'unido.int', 'some-ngo.org', 'ons.gov.uk'].map((d) => [d, orgOf(d)]),
    parse: parseDomainList(
      'domain\nhttps://www.WHO.int/publications\nwho.int\noecd.org, imf\n10.0.0.1\nbad_domain.org\nodi.org; iied.org',
    ),
  }
  await expect(JSON.stringify(golden, null, 1)).toMatchFileSnapshot('../fixtures/golden.json')
})
