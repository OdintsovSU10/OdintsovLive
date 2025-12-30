import { test, expect } from '@playwright/test'

test('Разбивка начислений октября 2025', async ({ page }) => {
  await page.goto('/salary/2025/9')
  await expect(page.locator('.salary-month-page')).toBeVisible()
  await expect(page.locator('.calc-item.total')).toBeVisible({ timeout: 5000 })

  const calcItems = page.locator('.calc-item')
  const count = await calcItems.count()

  console.log('=== Расчёт октября 2025 ===')
  for (let i = 0; i < count; i++) {
    const item = calcItems.nth(i)
    const label = await item.locator('span:first-child').textContent()
    const value = await item.locator('span:last-child').textContent()
    console.log(`${label}: ${value}`)
  }
})
