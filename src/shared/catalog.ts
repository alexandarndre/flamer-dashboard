import type { Blocker, DomainActionType, DomainStatus, Pace, RejectReason, Remedy, RunStatus } from './contract'

export type BlockerInfo = {
  title: string
  explain: string
  remedies: Remedy[]
  recommended: Remedy
}

export const BLOCKER_INFO: Record<Blocker, BlockerInfo> = {
  captcha: {
    title: 'CAPTCHA challenge',
    explain: 'The site shows a “prove you are human” check that the crawler cannot pass on its own.',
    remedies: ['solved_session', 'request_allowlist', 'retry'],
    recommended: 'solved_session',
  },
  waf: {
    title: 'Blocked by firewall',
    explain:
      'The site’s security firewall answers our requests with “403 Forbidden”, usually because we look too busy.',
    remedies: ['slow_down', 'request_allowlist', 'retry'],
    recommended: 'slow_down',
  },
  robots: {
    title: 'Disallowed by robots.txt',
    explain:
      'The publisher asks crawlers to stay out of the section that holds the documents. We respect that unless they agree otherwise.',
    remedies: ['request_permission'],
    recommended: 'request_permission',
  },
  login: {
    title: 'Login required',
    explain: 'The documents sit behind a sign-in page. A partner account would let us reach them.',
    remedies: ['add_credentials', 'request_allowlist'],
    recommended: 'add_credentials',
  },
  dns: {
    title: 'Domain not found',
    explain: 'The address does not resolve. It may be misspelled, retired, or temporarily down.',
    remedies: ['retry'],
    recommended: 'retry',
  },
  tls: {
    title: 'Certificate problem',
    explain: 'The site’s security certificate is expired or invalid, so the connection is refused by default.',
    remedies: ['allow_insecure', 'retry'],
    recommended: 'allow_insecure',
  },
  no_pdfs: {
    title: 'No PDFs found',
    explain: 'We mapped the site but found no PDF documents. Publications may live on another path or subdomain.',
    remedies: ['add_entry_point'],
    recommended: 'add_entry_point',
  },
  unstable: {
    title: 'Site keeps timing out',
    explain: 'The server stopped responding after 3 automatic retries.',
    remedies: ['slow_down', 'retry'],
    recommended: 'slow_down',
  },
}

export const REMEDY_INFO: Record<Remedy, { label: string; hint: string }> = {
  retry: { label: 'Retry now', hint: 'Try again with the same settings.' },
  slow_down: { label: 'Retry slower', hint: 'Halve the request rate and retry.' },
  solved_session: {
    label: 'Solve once & retry',
    hint: 'Pass the check in the shared browser, then reuse that session.',
  },
  request_allowlist: { label: 'Ask publisher to allow us', hint: 'Email the publisher and wait for their answer.' },
  request_permission: { label: 'Request permission', hint: 'Ask the publisher for a robots.txt exception.' },
  add_credentials: { label: 'Use partner login', hint: 'Crawl with the partner account stored in the vault.' },
  allow_insecure: { label: 'Accept certificate', hint: 'Proceed despite the certificate error for this domain.' },
  add_entry_point: { label: 'Add publications path', hint: 'Start from the site’s /publications or /library page.' },
}

export const STATUS_INFO: Record<DomainStatus, { label: string; tone: Tone; explain: string }> = {
  queued: { label: 'Queued', tone: 'muted', explain: 'Waiting for a free crawler slot.' },
  discovering: { label: 'Mapping site', tone: 'info', explain: 'Following links and sitemaps to find documents.' },
  downloading: { label: 'Downloading', tone: 'info', explain: 'Fetching the PDFs that were found.' },
  processing: { label: 'Processing', tone: 'info', explain: 'Validating, extracting text and removing duplicates.' },
  backing_off: {
    label: 'Auto-retrying',
    tone: 'warn',
    explain: 'The site is slow or rate-limiting us; retrying automatically.',
  },
  waiting_owner: {
    label: 'Waiting on publisher',
    tone: 'warn',
    explain: 'We asked the publisher and are waiting for an answer.',
  },
  needs_attention: { label: 'Needs you', tone: 'danger', explain: 'Blocked. A person has to decide what to do next.' },
  paused: { label: 'Paused', tone: 'muted', explain: 'Paused by an operator. Progress is kept.' },
  completed: { label: 'Done', tone: 'success', explain: 'All documents found were processed.' },
  skipped: { label: 'Skipped', tone: 'muted', explain: 'An operator decided to skip this domain.' },
  cancelled: { label: 'Cancelled', tone: 'muted', explain: 'The run was cancelled before this domain finished.' },
}

export const RUN_STATUS_INFO: Record<RunStatus, { label: string; tone: Tone }> = {
  running: { label: 'Running', tone: 'info' },
  paused: { label: 'Paused', tone: 'muted' },
  blocked: { label: 'Waiting for you', tone: 'danger' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
}

export const REJECT_INFO: Record<RejectReason, string> = {
  not_pdf: 'Not really a PDF',
  encrypted: 'Password-protected',
  corrupted: 'Damaged file',
  scanned: 'Scanned image, no text',
  too_large: 'Over size limit',
  off_topic: 'Not a report (forms, menus…)',
}

export const PACE_INFO: Record<Pace, { label: string; hint: string; factor: number }> = {
  gentle: { label: 'Gentle', hint: 'Slow and polite. Fewest blocks.', factor: 0.6 },
  standard: { label: 'Standard', hint: 'Balanced speed and politeness.', factor: 1 },
  aggressive: { label: 'Fast', hint: 'Quickest, but sites block us more often.', factor: 1.6 },
}

export type Tone = 'muted' | 'info' | 'warn' | 'danger' | 'success'

export const AGING_MS = 60 * 60_000
export const OVERDUE_MS = 4 * 60 * 60_000

export function slaOf(since: number, now: number): 'fresh' | 'aging' | 'overdue' {
  const age = now - since
  return age >= OVERDUE_MS ? 'overdue' : age >= AGING_MS ? 'aging' : 'fresh'
}

export const ACTIVE_STATUSES: readonly DomainStatus[] = ['discovering', 'downloading', 'processing', 'backing_off']
export const TERMINAL_STATUSES: readonly DomainStatus[] = ['completed', 'skipped', 'cancelled']

export function availableActions(status: DomainStatus): DomainActionType[] {
  return [...stateActions(status), 'assign', 'note']
}

function stateActions(status: DomainStatus): DomainActionType[] {
  switch (status) {
    case 'queued':
    case 'discovering':
    case 'downloading':
    case 'processing':
    case 'backing_off':
      return ['pause', 'skip']
    case 'paused':
      return ['resume', 'skip']
    case 'needs_attention':
      return ['resolve', 'retry', 'skip']
    case 'waiting_owner':
      return ['skip']
    case 'skipped':
      return ['retry']
    default:
      return []
  }
}
