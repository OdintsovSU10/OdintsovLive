import { test, expect } from '@playwright/test'

test('SalaryMonthPage iPhone', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })

  await page.goto('/salary/2026/0')
  await page.waitForLoadState('networkidle')

  await page.screenshot({
    path: './tests/screenshots/salary-month-iphone.png',
    fullPage: true
  })
})
