import { PACE_INFO } from '../../shared/catalog'
import {
  REJECT_REASONS,
  type Blocker,
  type Counters,
  type RejectReason,
  type Remedy,
  type RunMode,
  type RunSettings,
} from '../../shared/contract'
import { hash32, rng } from './rng'

export type DomainProfile = {
  tendency: Blocker | null
  pages: number
  pdfRatio: number
  altPdfRatio: number
  dupRatio: number
  updRatio: number
  rejectRatio: number
  rejectMix: Record<RejectReason, number>
  flaky: number
}

export type Episode = { at: number; durSec: number; kind: 'rate_limited' | 'timeout' }

export type AttemptPlan = {
  blocker: Blocker | null
  failAt: number | null
  episodes: Episode[]
  durationSec: number
}

export const MAP_END = 0.3
export const DOWNLOAD_END = 0.85
const PROCESS_START = 0.4

const KNOWN: Partial<Record<string, Partial<DomainProfile>>> = {
  'who.int': { tendency: 'captcha', pages: 9200 },
  'imf.org': { tendency: 'unstable' },
  'ecb.europa.eu': { tendency: 'robots' },
  'wto.org': { tendency: 'waf', pages: 7800 },
  'unhcr.org': { tendency: 'login' },
  'iaea.org': { tendency: null, flaky: 0.9 },
  'worldbank.org': { tendency: null, pages: 14800, pdfRatio: 0.34 },
  'oecd.org': { tendency: null, pages: 11800 },
  'unicef.org': { tendency: null },
  'cfr.org': { tendency: 'waf' },
  'sipri.org': { tendency: 'no_pdfs' },
  'piie.com': { tendency: 'tls' },
  'odi.org': { tendency: 'captcha' },
  'gavi.org': { tendency: 'robots' },
  'ippf.org': { tendency: 'captcha' },
  'plan-international.org': { tendency: 'waf' },
  'path.org': { tendency: null },
  'msf.org': { tendency: null, pages: 6400 },
  'savethechildren.net': { tendency: 'dns' },
  'care.org': { tendency: null },
  'e3g.org': { tendency: null },
}

const TENDENCIES: [Blocker | null, number][] = [
  [null, 0.8],
  ['captcha', 0.05],
  ['waf', 0.04],
  ['robots', 0.03],
  ['no_pdfs', 0.02],
  ['login', 0.02],
  ['unstable', 0.015],
  ['tls', 0.015],
  ['dns', 0.01],
]

export function profileOf(domain: string): DomainProfile {
  const r = rng(hash32('profile', domain))
  let roll = r.next()
  let tendency: Blocker | null = null
  for (const [candidate, weight] of TENDENCIES) {
    if ((roll -= weight) < 0) {
      tendency = candidate
      break
    }
  }
  const weights = REJECT_REASONS.map(() => r.range(0.2, 1))
  const total = weights.reduce((a, b) => a + b, 0)
  const base: DomainProfile = {
    tendency,
    pages: Math.round(Math.exp(r.range(Math.log(400), Math.log(9000)))),
    pdfRatio: r.range(0.08, 0.32),
    altPdfRatio: r.range(0.1, 0.25),
    dupRatio: r.range(0.08, 0.4),
    updRatio: r.range(0.04, 0.12),
    rejectRatio: r.range(0.04, 0.16),
    rejectMix: Object.fromEntries(REJECT_REASONS.map((k, i) => [k, weights[i]! / total])) as Record<
      RejectReason,
      number
    >,
    flaky: r.range(0.05, 0.35),
  }
  const known = KNOWN[domain]
  return known === undefined ? base : { ...base, ...known }
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export function countersAt(profile: DomainProfile, mode: RunMode, p: number, entryPointAdded: boolean): Counters {
  const pdfRatio = profile.tendency === 'no_pdfs' ? (entryPointAdded ? profile.altPdfRatio : 0) : profile.pdfRatio
  const pdfTotal = Math.round(profile.pages * pdfRatio)
  const mapped = Math.min(1, p / MAP_END)
  const tail = clamp01((p - MAP_END) / (DOWNLOAD_END - MAP_END))
  const pages = Math.round(profile.pages * (0.8 * mapped + 0.2 * tail))
  const pdfsFound = Math.round(pdfTotal * (0.85 * mapped + 0.15 * tail))
  const downloaded = Math.min(pdfsFound, Math.round(pdfTotal * tail))
  const processed = Math.min(downloaded, Math.round(pdfTotal * clamp01((p - PROCESS_START) / (1 - PROCESS_START))))
  const rejected = Math.round(processed * profile.rejectRatio)
  const valid = processed - rejected
  const dupRatio = mode === 'recrawl' ? 0.55 + profile.dupRatio : profile.dupRatio
  const duplicates = Math.round(valid * dupRatio)
  const updated = mode === 'recrawl' ? Math.min(valid - duplicates, Math.round(valid * profile.updRatio)) : 0
  return {
    pages,
    pdfsFound,
    downloaded,
    processed,
    published: valid - duplicates - updated,
    updated,
    duplicates,
    rejected,
    rejectReasons: apportion(rejected, profile.rejectMix),
  }
}

function apportion(total: number, mix: Record<RejectReason, number>): Record<RejectReason, number> {
  const raw = REJECT_REASONS.map((k) => total * mix[k])
  const out = raw.map(Math.floor)
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0])
  for (let left = total - out.reduce((a, b) => a + b, 0), j = 0; left > 0; left--, j++) out[order[j]![1]]! += 1
  return Object.fromEntries(REJECT_REASONS.map((k, i) => [k, out[i]!])) as Record<RejectReason, number>
}

export function emptyCounters(): Counters {
  return {
    pages: 0,
    pdfsFound: 0,
    downloaded: 0,
    processed: 0,
    published: 0,
    updated: 0,
    duplicates: 0,
    rejected: 0,
    rejectReasons: Object.fromEntries(REJECT_REASONS.map((k) => [k, 0])) as Record<RejectReason, number>,
  }
}

export function addCounters(into: Counters, c: Counters): Counters {
  into.pages += c.pages
  into.pdfsFound += c.pdfsFound
  into.downloaded += c.downloaded
  into.processed += c.processed
  into.published += c.published
  into.updated += c.updated
  into.duplicates += c.duplicates
  into.rejected += c.rejected
  for (const k of REJECT_REASONS) into.rejectReasons[k] += c.rejectReasons[k]
  return into
}

const REMEDY_SUCCESS: Record<Blocker, Partial<Record<Remedy, number>>> = {
  captcha: { retry: 0.15, solved_session: 0.9 },
  waf: { retry: 0.3, slow_down: 0.75 },
  robots: {},
  login: { add_credentials: 0.92 },
  dns: { retry: 0.3 },
  tls: { allow_insecure: 0.95, retry: 0.2 },
  no_pdfs: { add_entry_point: 0.9 },
  unstable: { retry: 0.55, slow_down: 0.85 },
}

export const OWNER_APPROVAL: Partial<Record<Remedy, number>> = { request_allowlist: 0.75, request_permission: 0.6 }

export type PlanInput = {
  domain: string
  seed: number
  attempt: number
  startP: number
  settings: RunSettings
  profile: DomainProfile
  slowed: boolean
  previous: Blocker | null
  remedy: Remedy | null
  approved: boolean
}

export function planAttempt(input: PlanInput): AttemptPlan {
  const { profile, settings, startP } = input
  const r = rng(hash32('attempt', input.seed, input.domain, input.attempt, input.remedy ?? '-'))
  const durationSec =
    (Math.min(900, Math.max(90, 60 + Math.sqrt(profile.pages) * 6)) / PACE_INFO[settings.pace].factor) *
    (input.slowed ? 1.7 : 1)

  let blocker: Blocker | null
  if (input.attempt === 1) {
    blocker = profile.tendency === 'robots' && !settings.respectRobots ? null : profile.tendency
    if (blocker === null && settings.pace === 'aggressive' && r.chance(0.12)) blocker = 'waf'
  } else if (input.previous === null || input.approved) {
    blocker = null
  } else {
    blocker = r.chance(REMEDY_SUCCESS[input.previous][input.remedy ?? 'retry'] ?? 0) ? null : input.previous
  }

  const room = 1 - startP
  let failAt: number | null = null
  if (blocker !== null && input.attempt > 1) failAt = startP + 0.01 + r.next() * 0.12 * room
  else if (blocker !== null)
    failAt = {
      captcha: r.range(0.05, 0.5),
      waf: r.range(0.1, 0.6),
      robots: 0.02,
      login: r.range(0.04, 0.14),
      dns: 0.003,
      tls: 0.004,
      no_pdfs: MAP_END,
      unstable: r.range(0.35, 0.7),
    }[blocker]

  const end = failAt ?? 1
  const episodeCount =
    blocker === 'unstable' ? 2 : r.chance(profile.flaky * (settings.pace === 'aggressive' ? 1.8 : 1)) ? r.int(1, 2) : 0
  const episodes = Array.from({ length: episodeCount }, () => ({
    at: startP + r.range(0.05, 0.95) * (end - startP),
    durSec: r.range(12, 45) * (input.slowed ? 1.4 : 1),
    kind: r.chance(0.6) ? ('rate_limited' as const) : ('timeout' as const),
  })).sort((a, b) => a.at - b.at)

  return { blocker, failAt, episodes, durationSec }
}
