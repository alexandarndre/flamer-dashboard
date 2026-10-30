import { defineConfig, devices } from '@playwright/test'

const deployed = process.env.E2E_BASE_URL
const baseURL = (deployed ?? 'http://localhost:5173/').replace(/\/?$/, '/')
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: process.env.CI !== undefined,
  retries: process.env.CI !== undefined ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: process.env.CI !== undefined ? 2 : 4,
  reporter: process.env.CI !== undefined ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    channel: process.env.PW_CHANNEL,
    extraHTTPHeaders:
      bypass === undefined || bypass === ''
        ? undefined
        : { 'x-vercel-protection-bypass': bypass, 'x-vercel-set-bypass-cookie': 'true' },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer:
    deployed === undefined
      ? {
          command: 'yarn dev --port 5173 --strictPort',
          url: 'http://localhost:5173/api/health',
          reuseExistingServer: process.env.CI === undefined,
          timeout: 120_000,
        }
      : undefined,
})
