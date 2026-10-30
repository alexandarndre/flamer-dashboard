import { test as base, expect, type Page } from '@playwright/test'

export const test = base.extend<{ page: Page; allowConsole: RegExp[]; firstVisit: boolean }>({
  allowConsole: [[], { option: true }],
  firstVisit: [false, { option: true }],
  page: async ({ page, allowConsole, firstVisit }, use) => {
    const problems: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error' && !allowConsole.some((r) => r.test(m.text()))) problems.push(m.text())
    })
    page.on('pageerror', (e) => problems.push(e.message))
    if (!firstVisit) await page.addInitScript(() => localStorage.setItem('flamer-tour-seen', '1'))
    await use(page)
    expect(problems, 'console errors').toEqual([])
  },
})

export { expect }

export async function waitForLive(page: Page) {
  await expect(page.getByText('Live updates')).toBeVisible({ timeout: 20_000 })
}
