import { test as setup, expect } from '@playwright/test'

const AUTH_FILE = './tests/auth.json'

setup('authenticate', async ({ page }) => {
  await page.goto('/')

  // Проверяем если уже авторизованы
  const sidebar = page.locator('.sidebar')
  if (await sidebar.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.context().storageState({ path: AUTH_FILE })
    return
  }

  // Авторизация
  await page.locator('input[type="email"]').fill('odintsov.live@ya.ru')
  await page.locator('input[type="password"]').fill('569965740_dJ')
  await page.getByRole('button', { name: /войти/i }).click()

  await expect(sidebar).toBeVisible({ timeout: 15000 })
  await page.context().storageState({ path: AUTH_FILE })
})
