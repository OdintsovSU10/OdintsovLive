import { test as setup, expect } from '@playwright/test'

const AUTH_FILE = './tests/auth.json'

setup('authenticate', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const sidebar = page.locator('.sidebar')
  const authForm = page.locator('input[type="email"]')

  // Проверяем если уже авторизованы
  const needsAuth = await authForm.isVisible({ timeout: 5000 }).catch(() => false)

  if (!needsAuth) {
    if (await sidebar.isVisible({ timeout: 5000 }).catch(() => false)) {
      await page.context().storageState({ path: AUTH_FILE })
      return
    }
  }

  // Авторизация
  await page.locator('input[type="email"]').fill('odintsov.live@ya.ru')
  await page.locator('input[type="password"]').fill('569965740_dJ')
  await page.getByRole('button', { name: /войти/i }).click()

  // Ждём sidebar или ошибку
  try {
    await expect(sidebar).toBeVisible({ timeout: 30000 })
  } catch {
    // Проверяем на ошибку
    const errorEl = page.locator('.error-message, .auth-error')
    if (await errorEl.isVisible({ timeout: 1000 }).catch(() => false)) {
      const error = await errorEl.textContent()
      throw new Error(`Auth failed: ${error}`)
    }
    throw new Error('Login timeout - sidebar not visible')
  }

  await page.context().storageState({ path: AUTH_FILE })
})
