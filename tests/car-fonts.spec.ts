import { test, expect } from '@playwright/test'

test.use({ storageState: './tests/auth.json' })

test.describe('Car page fonts', () => {
  test('record date and cost have same font-weight', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/car')
    await page.waitForSelector('.car-page')

    const carSelector = page.locator('.car-selector')
    if (await carSelector.count() === 0) {
      console.log('No cars found, skipping test')
      return
    }

    // Проверяем вкладку ТО
    const maintenanceTab = page.locator('.car-tab').filter({ hasText: 'ТО' })
    await maintenanceTab.click()
    await page.waitForTimeout(500)

    const recordDate = page.locator('.record-date').first()
    const recordCost = page.locator('.record-cost').first()

    if (await recordDate.count() > 0 && await recordCost.count() > 0) {
      const dateStyle = await recordDate.evaluate(el => {
        const computed = window.getComputedStyle(el)
        return {
          fontWeight: computed.fontWeight,
          fontSize: computed.fontSize,
          color: computed.color
        }
      })

      const costStyle = await recordCost.evaluate(el => {
        const computed = window.getComputedStyle(el)
        return {
          fontWeight: computed.fontWeight,
          fontSize: computed.fontSize,
          color: computed.color
        }
      })

      console.log('Date styles:', dateStyle)
      console.log('Cost styles:', costStyle)

      // Проверяем что font-weight одинаковый (600 = bold)
      expect(dateStyle.fontWeight).toBe('600')
      expect(costStyle.fontWeight).toBe('600')
      expect(dateStyle.fontWeight).toBe(costStyle.fontWeight)
    } else {
      console.log('No records found in ТО tab')
    }

    // Проверяем вкладку Бензин
    const fuelTab = page.locator('.car-tab').filter({ hasText: 'Бензин' })
    await fuelTab.click()
    await page.waitForTimeout(500)

    const fuelDate = page.locator('.record-date').first()
    if (await fuelDate.count() > 0) {
      const fuelDateStyle = await fuelDate.evaluate(el => {
        const computed = window.getComputedStyle(el)
        return { fontWeight: computed.fontWeight }
      })
      console.log('Fuel date font-weight:', fuelDateStyle.fontWeight)
      expect(fuelDateStyle.fontWeight).toBe('600')
    } else {
      console.log('No records found in Бензин tab')
    }

    // Проверяем вкладку Допы
    const expensesTab = page.locator('.car-tab').filter({ hasText: 'Допы' })
    await expensesTab.click()
    await page.waitForTimeout(500)

    const expenseDate = page.locator('.record-date').first()
    if (await expenseDate.count() > 0) {
      const expenseDateStyle = await expenseDate.evaluate(el => {
        const computed = window.getComputedStyle(el)
        return { fontWeight: computed.fontWeight }
      })
      console.log('Expense date font-weight:', expenseDateStyle.fontWeight)
      expect(expenseDateStyle.fontWeight).toBe('600')
    } else {
      console.log('No records found in Допы tab')
    }
  })

  test('car age has muted color in selector', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/car')
    await page.waitForSelector('.car-page')

    const carAgeSmall = page.locator('.car-age-small').first()
    if (await carAgeSmall.count() > 0) {
      const ageStyle = await carAgeSmall.evaluate(el => {
        const computed = window.getComputedStyle(el)
        return {
          color: computed.color,
          opacity: computed.opacity,
          fontSize: computed.fontSize
        }
      })
      console.log('Car age styles:', ageStyle)

      // Проверяем что opacity меньше 1
      expect(parseFloat(ageStyle.opacity)).toBeLessThan(1)
    } else {
      console.log('No car age element found')
    }
  })
})
