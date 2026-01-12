import { test, expect } from '@playwright/test'

test.use({ storageState: './tests/auth.json' })

test.describe('Font settings', () => {
  test('admin page has visual settings tab and it works', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/admin')
    await page.waitForSelector('.admin-page')

    // Проверяем наличие вкладки "Оформление"
    const visualTab = page.locator('.admin-tab').filter({ hasText: 'Оформление' })
    await expect(visualTab).toBeVisible()

    // Кликаем на вкладку
    await visualTab.click({ force: true })
    await page.waitForTimeout(500)

    // Проверяем наличие настроек шрифтов
    await expect(page.locator('.visual-settings')).toBeVisible({ timeout: 10000 })

    // Проверяем наличие селектов для шрифтов
    const fontSelects = page.locator('.font-setting select')
    const selectCount = await fontSelects.count()
    console.log('Font select count:', selectCount)
    expect(selectCount).toBeGreaterThanOrEqual(3)

    // Проверяем наличие слайдера размера шрифта
    const fontSizeSlider = page.locator('.font-size-slider')
    await expect(fontSizeSlider).toBeVisible()
  })

  test('font size slider works', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/admin')
    await page.waitForSelector('.admin-page')

    const visualTab = page.locator('.admin-tab').filter({ hasText: 'Оформление' })
    await visualTab.click({ force: true })
    await page.waitForTimeout(500)
    await expect(page.locator('.visual-settings')).toBeVisible({ timeout: 10000 })

    const fontSizeSlider = page.locator('.font-size-slider')
    const initialValue = await fontSizeSlider.inputValue()
    console.log('Initial font size:', initialValue)

    await fontSizeSlider.fill('20')
    const newValue = await fontSizeSlider.inputValue()
    console.log('New font size:', newValue)
    expect(newValue).toBe('20')
  })

  test('font settings can be changed and saved', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/admin')
    await page.waitForSelector('.admin-page')

    const visualTab = page.locator('.admin-tab').filter({ hasText: 'Оформление' })
    await visualTab.click({ force: true })
    await page.waitForTimeout(500)
    await expect(page.locator('.visual-settings')).toBeVisible({ timeout: 10000 })

    // Меняем шрифт заголовков
    const headlineSelect = page.locator('.font-setting select').first()
    await headlineSelect.selectOption('Playfair Display')
    const newValue = await headlineSelect.inputValue()
    expect(newValue).toBe('Playfair Display')

    // Сохраняем
    const saveBtn = page.locator('.btn-save')
    await saveBtn.click({ force: true })
    await page.waitForTimeout(1000)

    // Проверяем что CSS переменная изменилась
    const fontHeadline = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--font-headline')
    })
    console.log('Applied --font-headline:', fontHeadline)
    expect(fontHeadline).toContain('Playfair Display')
  })

  test('reset button resets to defaults', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/admin')
    await page.waitForSelector('.admin-page')

    const visualTab = page.locator('.admin-tab').filter({ hasText: 'Оформление' })
    await visualTab.click({ force: true })
    await page.waitForTimeout(500)
    await expect(page.locator('.visual-settings')).toBeVisible({ timeout: 10000 })

    const headlineSelect = page.locator('.font-setting select').first()
    await headlineSelect.selectOption('Georgia')

    const resetBtn = page.locator('.btn-reset')
    await resetBtn.click({ force: true })

    const value = await headlineSelect.inputValue()
    console.log('After reset:', value)
    expect(value).toBe('Cormorant Garamond')
  })
})
