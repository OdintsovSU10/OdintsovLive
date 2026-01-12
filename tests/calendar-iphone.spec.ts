import { test, expect } from '@playwright/test'

test('CalendarPage iPhone 15 Pro Max', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })

  await page.goto('/calendar')
  await page.waitForLoadState('networkidle')

  await page.screenshot({
    path: './tests/screenshots/calendar-iphone.png',
    fullPage: true
  })
})
