import type { RunAction, RunRecord, RunSpec } from '../shared/contract'
import { simulateRun } from './sim/engine'

const MIN = 60_000

const IGO = [
  'worldbank.org',
  'imf.org',
  'oecd.org',
  'who.int',
  'unesco.org',
  'undp.org',
  'unicef.org',
  'ilo.org',
  'fao.org',
  'wto.org',
  'unhcr.org',
  'iaea.org',
  'wipo.int',
  'adb.org',
  'afdb.org',
  'iadb.org',
  'ebrd.com',
  'ecb.europa.eu',
  'bis.org',
  'unep.org',
]
const THINK_TANKS = [
  'brookings.edu',
  'rand.org',
  'chathamhouse.org',
  'carnegieendowment.org',
  'csis.org',
  'cfr.org',
  'urban.org',
  'pewresearch.org',
  'odi.org',
  'iied.org',
  'wri.org',
  'ifpri.org',
  'cgdev.org',
  'piie.com',
  'bruegel.org',
  'sipri.org',
]
const HEALTH = [
  'msf.org',
  'path.org',
  'gavi.org',
  'theglobalfund.org',
  'ippf.org',
  'icrc.org',
  'ifrc.org',
  'savethechildren.net',
  'oxfam.org',
  'care.org',
  'plan-international.org',
  'wateraid.org',
]
const STATS = ['ons.gov.uk', 'census.gov', 'abs.gov.au', 'statcan.gc.ca', 'destatis.de', 'insee.fr']

const spec = (
  id: string,
  name: string,
  createdAt: number,
  domains: string[],
  extra: Partial<RunSpec> = {},
): RunSpec => ({
  id,
  name,
  mode: 'backfill',
  settings: { concurrency: 6, pace: 'standard', respectRobots: true },
  domains,
  createdAt,
  createdBy: 'Maya R.',
  seed: domains.length * 7919 + id.length,
  ...extra,
})

const action = (runId: string, n: number, a: Omit<RunAction, 'id'>): RunAction => ({ id: `${runId}_seed_${n}`, ...a })

function blockedAt(record: RunRecord, at: number) {
  return simulateRun(record, at).domains.filter((d) => d.status === 'needs_attention' && d.blockedSince !== null)
}

export function seedRecords(now: number): RunRecord[] {
  const igo: RunRecord = {
    spec: spec('run_igo_weekly', 'Intergovernmental orgs · weekly recrawl', now - 21 * MIN, IGO, {
      mode: 'recrawl',
      settings: { concurrency: 5, pace: 'standard', respectRobots: true, recrawlEveryDays: 7 },
    }),
    actions: [],
  }
  const firstCaptcha = blockedAt(igo, now - 4 * MIN).find((d) => d.blocker === 'captcha')
  if (firstCaptcha !== undefined && firstCaptcha.blockedSince! + 3 * MIN < now)
    igo.actions.push(
      action(igo.spec.id, 1, {
        at: firstCaptcha.blockedSince! + 3 * MIN,
        type: 'resolve',
        remedy: 'solved_session',
        domains: [firstCaptcha.domain],
        actor: 'Maya R.',
      }),
    )

  const tanks: RunRecord = {
    spec: spec('run_think_tanks_b3', 'Think tanks · backfill batch 3', now - 190 * MIN, THINK_TANKS, {
      settings: { concurrency: 8, pace: 'standard', respectRobots: true, recrawlEveryDays: 30 },
      createdBy: 'Daniel K.',
    }),
    actions: [],
  }
  const tankBlocks = blockedAt(tanks, tanks.spec.createdAt + 70 * MIN)
  const waf = tankBlocks.find((d) => d.blocker === 'waf')
  if (waf !== undefined)
    tanks.actions.push(
      action(tanks.spec.id, 1, {
        at: waf.blockedSince! + 6 * MIN,
        type: 'skip',
        domains: [waf.domain],
        note: 'Members-only library, out of scope',
        actor: 'Daniel K.',
      }),
    )
  const tls = tankBlocks.find((d) => d.blocker === 'tls')
  if (tls !== undefined)
    tanks.actions.push(
      action(tanks.spec.id, 2, {
        at: tls.blockedSince! + 9 * MIN,
        type: 'resolve',
        remedy: 'allow_insecure',
        domains: [tls.domain],
        actor: 'Daniel K.',
      }),
    )

  const health: RunRecord = {
    spec: spec('run_health_ngos', 'Health NGOs · new sources', now - 4 * MIN, HEALTH, {
      settings: { concurrency: 4, pace: 'gentle', respectRobots: true },
    }),
    actions: [],
  }

  const statsStart = now - 26 * 60 * MIN
  const stats: RunRecord = {
    spec: spec('run_stats_pilot', 'National statistics offices · pilot', statsStart, STATS, {
      settings: { concurrency: 3, pace: 'aggressive', respectRobots: true, recrawlEveryDays: 1 },
      createdBy: 'Daniel K.',
    }),
    actions: [
      action('run_stats_pilot', 1, {
        at: statsStart + 18 * MIN,
        type: 'cancel_run',
        actor: 'Daniel K.',
        note: 'Pilot scope changed, will rerun with gentle pace',
      }),
    ],
  }

  return [stats, tanks, igo, health]
}
