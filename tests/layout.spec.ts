import { test, expect } from '@playwright/test'

test.use({ storageState: './tests/auth.json' })

test.describe('Layout tests', () => {
  test('SalaryPage has 6-column summary grid on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/salary')
    await page.waitForSelector('.year-summary')

    const summary = page.locator('.year-summary')
    const style = await summary.evaluate(el => {
      const computed = window.getComputedStyle(el)
      return {
        display: computed.display,
        gridTemplateColumns: computed.gridTemplateColumns
      }
    })

    console.log('SalaryPage .year-summary styles:', style)
    expect(style.display).toBe('grid')
    // Should have 6 columns on desktop
    const columnCount = style.gridTemplateColumns.split(' ').length
    expect(columnCount).toBe(6)
  })

  test('SalaryMonthPage has 2-column layout on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/salary/2025/9')
    await page.waitForSelector('.month-content')

    const content = page.locator('.month-content')
    const style = await content.evaluate(el => {
      const computed = window.getComputedStyle(el)
      return {
        display: computed.display,
        gridTemplateColumns: computed.gridTemplateColumns
      }
    })

    console.log('SalaryMonthPage .month-content styles:', style)
    expect(style.display).toBe('grid')
    // Should have 2 columns on desktop
    const columnCount = style.gridTemplateColumns.split(' ').length
    expect(columnCount).toBe(2)
  })

  test('RentPage has correct layout', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/rent')
    await page.waitForSelector('.year-summary')

    const summary = page.locator('.year-summary')
    const style = await summary.evaluate(el => {
      const computed = window.getComputedStyle(el)
      return {
        display: computed.display,
        gridTemplateColumns: computed.gridTemplateColumns
      }
    })

    console.log('RentPage .year-summary styles:', style)
    expect(style.display).toBe('grid')
    // Should have 4 columns (Аренда, Вода, Электричество, Итого)
    const columnCount = style.gridTemplateColumns.split(' ').length
    expect(columnCount).toBe(4)
  })
})
