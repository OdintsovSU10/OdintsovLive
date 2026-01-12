import { test, expect } from '@playwright/test'

test('Navigation from calendar to salary and back - no shift', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })

  // Go to calendar
  await page.goto('/calendar')
  await page.waitForLoadState('networkidle')

  // Click on January month title to navigate to salary
  await page.click('.month-title')
  await page.waitForLoadState('networkidle')

  // Take screenshot of salary month page
  await page.screenshot({
    path: './tests/screenshots/salary-month-from-calendar.png',
  })

  // Go back
  await page.goBack()
  await page.waitForLoadState('networkidle')

  // Should be on salary page now, check no horizontal shift
  await page.screenshot({
    path: './tests/screenshots/salary-after-back.png',
  })

  // Verify page is not shifted - check viewport
  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth)
  const scrollX = await page.evaluate(() => window.scrollX)

  console.log('Viewport width:', viewportWidth)
  console.log('Scroll X:', scrollX)

  expect(scrollX).toBe(0)
})

test('HomePage with datetime on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })

  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Check datetime is visible
  const datetime = page.locator('.home-datetime')
  await expect(datetime).toBeVisible()

  await page.screenshot({
    path: './tests/screenshots/home-datetime-mobile.png',
  })
})
