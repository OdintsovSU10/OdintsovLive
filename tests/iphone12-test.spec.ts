import { test, expect } from '@playwright/test'

test('Site on iPhone 12 Pro', async ({ page }) => {
  // iPhone 12 Pro viewport: 390x844
  await page.setViewportSize({ width: 390, height: 844 })

  // Test SalaryPage
  await page.goto('/salary')
  await page.waitForLoadState('networkidle')
  await page.screenshot({
    path: './tests/screenshots/salary-iphone12.png',
    fullPage: true
  })

  // Test BodyParamsPage
  await page.goto('/body/params')
  await page.waitForLoadState('networkidle')
  await page.screenshot({
    path: './tests/screenshots/body-params-iphone12.png',
    fullPage: true
  })

  // Test RentPage
  await page.goto('/rent')
  await page.waitForLoadState('networkidle')
  await page.screenshot({
    path: './tests/screenshots/rent-iphone12.png',
    fullPage: true
  })

  // Test HomePage
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.screenshot({
    path: './tests/screenshots/home-iphone12.png',
    fullPage: true
  })
})
