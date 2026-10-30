import { expect, test, waitForLive } from './fixtures'

test('@smoke overview shows live data and the source map', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Crawl operations' })).toBeVisible()
  await waitForLive(page)
  await expect(page.getByText(/domains are blocked and waiting for you/)).toBeVisible()
  await expect(page.getByText(/\d+ sources in \d+ countries/).first()).toBeVisible()
  await expect(page.locator('[aria-label="Map of crawled sources"] circle').first()).toBeVisible()
})

test('@smoke unblocking a domain from the inbox removes it', async ({ page }) => {
  await page.goto('issues')
  await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible()
  const rows = page.locator('main .divide-y > div')
  const before = await rows.count()
  expect(before).toBeGreaterThan(0)
  await rows
    .first()
    .getByRole('button')
    .filter({ hasNotText: /Skip|note|Unassigned/ })
    .first()
    .click()
  await expect(rows).toHaveCount(before - 1, { timeout: 15_000 })
})

test('@smoke starting a crawl cleans the list and opens the run', async ({ page }) => {
  await page.goto('runs/new')
  await page.getByRole('button', { name: 'Messy paste' }).click()
  await expect(page.getByText(/can’t be used/)).toBeVisible()
  await page.getByRole('button', { name: 'Climate think tanks' }).click()
  await page.getByLabel('Run name').fill('E2E climate crawl')
  await page.getByRole('button', { name: 'Start crawl' }).click()
  await expect(page).toHaveURL(/\/runs\/run_/)
  await expect(page.getByRole('heading', { name: /E2E climate crawl/ })).toBeVisible()
  await expect(page.getByText('Running', { exact: true }).first()).toBeVisible()
})

test('domain drawer: owner, note, Escape closes', async ({ page }) => {
  await page.goto('runs/run_igo_weekly')
  await expect(page.getByText('complete', { exact: true })).toBeVisible()
  await page.locator('tbody tr').nth(1).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  await drawer.getByRole('button', { name: 'Unassigned' }).click()
  await page.getByRole('menuitem', { name: /Assign to me/ }).click()
  await expect(drawer.getByRole('button', { name: 'You' })).toBeVisible({ timeout: 10_000 })
  await drawer.getByRole('button', { name: 'Add note' }).click()
  await page.getByPlaceholder(/Emailed their webmaster/).fill('Checked with the publisher')
  await page.getByRole('button', { name: 'Add note' }).last().click()
  await expect(drawer.getByText('Checked with the publisher', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
})

test('run controls: pause, resume and replay', async ({ page }) => {
  await page.goto('runs/run_health_ngos')
  await page.getByRole('button', { name: 'Pause run' }).click()
  await page.getByRole('button', { name: 'Resume run' }).click()
  await expect(page.getByRole('button', { name: 'Pause run' })).toBeVisible({ timeout: 10_000 })
  const sandbox = await page.evaluate(() => localStorage.getItem('flamer-sandbox') ?? '')
  const runs = await (await page.request.get('api/runs', { headers: { 'x-flamer-sandbox': sandbox } })).json()
  const run = runs.find((r: { id: string }) => r.id === 'run_health_ngos')
  await page.goto(`runs/run_health_ngos?at=${run.createdAt + 60_000}`)
  await expect(page.getByText(/Viewing a replay/)).toBeVisible()
})

test('shift-click selects a range and bulk actions apply', async ({ page }) => {
  await page.goto('runs/run_igo_weekly')
  const boxes = page.locator('tbody [role="checkbox"]')
  await boxes.nth(1).click()
  await boxes.nth(4).click({ modifiers: ['Shift'] })
  await expect(page.locator('tbody [role="checkbox"][aria-checked="true"]')).toHaveCount(4)
  await expect(page.getByText('4 selected')).toBeVisible()
  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(page.locator('tbody [role="checkbox"][aria-checked="true"]')).toHaveCount(0)
})

test('inbox filters by owner and exports CSV', async ({ page }) => {
  await page.goto('issues')
  const row = page.locator('main .divide-y > div').first()
  await row.getByRole('button', { name: 'Unassigned' }).click()
  await page.getByRole('menuitem', { name: /Assign to me/ }).click()
  await page.getByRole('tab', { name: /Mine/ }).click()
  await expect(page.locator('main .divide-y > div')).toHaveCount(1, { timeout: 10_000 })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV' }).click()
  expect((await download).suggestedFilename()).toBe('flamer-blocked-domains.csv')
})

test.describe('explore', () => {
  test.use({ allowConsole: [/404/] })

  test('focus, search, group and recover from a bad focus', async ({ page }) => {
    await page.goto('explore')
    await expect(page.locator('[aria-label^="Relationship graph"] [role="button"]').first()).toBeVisible()
    await page.getByRole('button', { name: 'Intergovernmental orgs · weekly recrawl', exact: true }).click()
    await expect(page).toHaveURL(/focus=run/)
    await expect(page.getByText('Through those')).toBeVisible()
    await page.getByLabel('Find in graph').fill('who.int')
    await page.getByRole('button', { name: 'Focus', exact: true }).click()
    await expect(page).toHaveURL(/focus=domain%3Awho.int|focus=domain:who.int/)
    await page.goto('explore?focus=domain%3Anowhere.example')
    await expect(page.getByText(/Nothing called/)).toBeVisible()
  })
})

test('demo clock speeds up and reset re-seeds', async ({ page }) => {
  await page.goto('./')
  await waitForLive(page)
  const demo = page.getByRole('button', { name: /^Demo/ })
  await demo.click()
  await page.getByRole('radio', { name: '60× faster' }).click()
  await expect(page.getByText(/Demo clock running 60× faster/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(demo).toContainText('60×')
  await demo.click()
  await page.getByRole('button', { name: 'Reset demo data' }).click()
  await page.getByRole('button', { name: 'Click again to wipe and re-seed' }).click()
  await expect(page.getByText('Demo data reset')).toBeVisible()
  await expect(demo).not.toContainText('60×')
})

test.describe('first visit', () => {
  test.use({ firstVisit: true })

  test('opens the welcome dialog and the tour walks through pages', async ({ page }) => {
    await page.goto('./')
    await expect(page.getByRole('heading', { name: 'Welcome to the Flamer demo' })).toBeVisible()
    await page.getByRole('button', { name: 'Take the 1-minute tour' }).click()
    const tour = page.getByRole('dialog', { name: 'Guided tour' })
    await expect(tour).toContainText('1 of 5')
    await tour.getByRole('button', { name: 'Next' }).click()
    await expect(page).toHaveURL(/issues/)
  })
})

test('command palette jumps to a domain', async ({ page }) => {
  await page.goto('./')
  await waitForLive(page)
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByPlaceholder('Search runs, domains, pages…').fill('who.int')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toContainText('who.int')
})

test('@smoke API docs and OpenAPI document are served', async ({ request }) => {
  test.skip(
    process.env.E2E_BACKEND === 'static',
    'Static hosting has no server-side API; the Service Worker serves it in the page',
  )
  const doc = await (await request.get('api/openapi.json')).json()
  expect(doc.openapi).toBe('3.1.0')
  expect((await request.get('api/docs')).headers()['content-type']).toContain('text/html')
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 400, height: 860 } })

  test('run page works on a phone', async ({ page }) => {
    await page.goto('runs/run_health_ngos')
    await expect(page.getByText('complete', { exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Domains' })).toBeVisible()
  })
})
