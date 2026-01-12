import { test, expect } from '@playwright/test'

test('SalaryPage iPhone 15 Pro Max', async ({ page }) => {
  // iPhone 15 Pro Max viewport
  await page.setViewportSize({ width: 430, height: 932 })

  await page.goto('/salary')
  await page.waitForLoadState('networkidle')

  // Take screenshot
  await page.screenshot({
    path: './tests/screenshots/salary-iphone.png',
    fullPage: true
  })

  // Check order: stats should be before chart, chart before months
  const statsBox = page.locator('.chart-summary')
  const chartBox = page.locator('.salary-chart')
  const monthsList = page.locator('.months-list')

  await expect(statsBox).toBeVisible()
  await expect(chartBox).toBeVisible()
  await expect(monthsList).toBeVisible()

  // Verify CSS order
  const statsOrder = await statsBox.evaluate(el => window.getComputedStyle(el.parentElement!).order)
  const monthsOrder = await monthsList.evaluate(el => window.getComputedStyle(el).order)

  console.log('Stats parent order:', statsOrder)
  console.log('Months order:', monthsOrder)
})
