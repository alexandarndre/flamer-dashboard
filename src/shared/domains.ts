export type ParsedDomains = {
  valid: string[]
  duplicates: string[]
  invalid: { input: string; reason: string }[]
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/
const HEADER = /^(domains?|urls?|websites?|sites?|hosts?)$/i

export function normalizeDomain(raw: string): string | { reason: string } {
  const input = raw.trim().replace(/^["']|["']$/g, '')
  if (input.length === 0) return { reason: 'Empty value' }
  if (/\s/.test(input)) return { reason: 'Contains spaces' }
  let host: string
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`).hostname
  } catch {
    return { reason: 'Not a web address' }
  }
  host = host
    .toLowerCase()
    .replace(/^www\d?\./, '')
    .replace(/\.$/, '')
  if (/^\d+(\.\d+){3}$/.test(host) || host.startsWith('[')) return { reason: 'IP addresses are not crawlable sources' }
  const labels = host.split('.')
  if (labels.length < 2) return { reason: 'Missing top-level domain (e.g. .org)' }
  if (!TLD.test(labels.at(-1)!)) return { reason: 'Unknown top-level domain' }
  if (!labels.every((l) => LABEL.test(l))) return { reason: 'Invalid characters in domain' }
  if (host.length > 253) return { reason: 'Domain is too long' }
  return host
}

export function parseDomainList(text: string): ParsedDomains {
  const seen = new Set<string>()
  const result: ParsedDomains = { valid: [], duplicates: [], invalid: [] }
  for (const token of text.split(/[\n,;\t]+/)) {
    if (token.trim().length === 0 || token.trim().startsWith('#') || HEADER.test(token.trim())) continue
    const normalized = normalizeDomain(token)
    if (typeof normalized !== 'string') result.invalid.push({ input: token.trim(), reason: normalized.reason })
    else if (seen.has(normalized)) result.duplicates.push(normalized)
    else {
      seen.add(normalized)
      result.valid.push(normalized)
    }
  }
  return result
}
