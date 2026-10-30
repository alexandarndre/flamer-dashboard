import { test as base, expect, type Page } from '@playwright/test'

export const test = base.extend<{ page: Page; allowConsole: RegExp[]; firstVisit: boolean }>({
  allowConsole: [[], { option: true }],
  firstVisit: [false, { option: true }],
  page: async ({ page, allowConsole, firstVisit }, use) => {
    const problems: { text: string; url: string }[] = []
    const spaFallbacks = new Set<string>()
    if (process.env.E2E_BACKEND === 'static')
      page.on('response', (r) => {
        if (r.status() === 404 && r.request().isNavigationRequest()) spaFallbacks.add(r.url())
      })
    page.on('console', (m) => {
      if (m.type() === 'error' && !allowConsole.some((r) => r.test(m.text())))
        problems.push({ text: m.text(), url: m.location().url })
    })
    page.on('pageerror', (e) => problems.push({ text: e.message, url: '' }))
    if (!firstVisit) await page.addInitScript(() => localStorage.setItem('flamer-tour-seen', '1'))
    await use(page)
    expect(
      problems.filter((p) => !spaFallbacks.has(p.url)).map((p) => p.text),
      'console errors',
    ).toEqual([])
  },
})

export { expect }

export async function waitForLive(page: Page) {
  await expect(page.getByText('Live updates')).toBeVisible({ timeout: 20_000 })
}
