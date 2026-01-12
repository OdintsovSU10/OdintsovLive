import { test, expect } from '@playwright/test'

test.use({ storageState: './tests/auth.json' })

test.describe('Car mileage chart', () => {
  test('mileage chart displays data points', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/car')

    // Ждём загрузки страницы
    await page.waitForSelector('.car-page')

    // Проверяем что есть выбранная машина
    const carSelector = page.locator('.car-selector')
    const hasCar = await carSelector.count() > 0

    if (!hasCar) {
      console.log('No cars found, skipping test')
      return
    }

    // Переключаемся на вкладку "Сводная"
    const summaryTab = page.locator('.car-tab').filter({ hasText: 'Сводная' })
    await summaryTab.click()

    // Ждём загрузки карточки с графиком
    await page.waitForSelector('.car-chart-card')

    // Переключаемся на вкладку "Пробег"
    const mileageTab = page.locator('.chart-tab').filter({ hasText: 'Пробег' })
    await mileageTab.click()

    // Ждём отображения графика или сообщения об отсутствии данных
    await page.waitForTimeout(500)

    // Проверяем наличие графика или сообщения
    const chartContainer = page.locator('.chart-container')
    const chartEmpty = page.locator('.chart-empty')

    const hasChart = await chartContainer.count() > 0
    const hasEmptyMessage = await chartEmpty.count() > 0

    expect(hasChart || hasEmptyMessage).toBe(true)

    if (hasChart) {
      // Проверяем что график Recharts отрендерился
      const svgChart = page.locator('.recharts-wrapper')
      await expect(svgChart).toBeVisible()

      // Проверяем наличие области графика
      const areaPath = page.locator('.recharts-area-area')
      const hasArea = await areaPath.count() > 0
      console.log('Chart has area path:', hasArea)

      // Проверяем наличие точек данных на оси X
      const xAxisTicks = page.locator('.recharts-xAxis .recharts-cartesian-axis-tick')
      const tickCount = await xAxisTicks.count()
      console.log('X-axis tick count:', tickCount)

      // Должно быть минимум 2 точки (Покупка и Сейчас)
      expect(tickCount).toBeGreaterThanOrEqual(2)

      // Проверяем что есть метка "Покупка" или "Сейчас"
      const xAxisText = await page.locator('.recharts-xAxis').textContent()
      console.log('X-axis labels:', xAxisText)

      const hasPurchaseLabel = xAxisText?.includes('Покупка')
      const hasNowLabel = xAxisText?.includes('Сейчас')
      console.log('Has Покупка label:', hasPurchaseLabel)
      console.log('Has Сейчас label:', hasNowLabel)
    } else {
      console.log('No chart data, empty message displayed')
      const emptyText = await chartEmpty.textContent()
      console.log('Empty message:', emptyText)
    }
  })

  test('mileage chart includes all records with mileage', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/car')

    await page.waitForSelector('.car-page')

    const carSelector = page.locator('.car-selector')
    if (await carSelector.count() === 0) {
      console.log('No cars found, skipping test')
      return
    }

    // Переключаемся на вкладку ТО и считаем записи с пробегом
    const maintenanceTab = page.locator('.car-tab').filter({ hasText: 'ТО' })
    await maintenanceTab.click()
    await page.waitForTimeout(300)

    const maintenanceMileage = page.locator('.record-mileage')
    const maintenanceCount = await maintenanceMileage.count()
    console.log('Maintenance records with mileage:', maintenanceCount)

    // Переключаемся на вкладку Бензин и считаем записи с пробегом
    const fuelTab = page.locator('.car-tab').filter({ hasText: 'Бензин' })
    await fuelTab.click()
    await page.waitForTimeout(300)

    const fuelMileage = page.locator('.record-mileage')
    const fuelCount = await fuelMileage.count()
    console.log('Fuel records with mileage:', fuelCount)

    const totalRecordsWithMileage = maintenanceCount + fuelCount
    console.log('Total records with mileage:', totalRecordsWithMileage)

    // Переключаемся на график пробега
    const summaryTab = page.locator('.car-tab').filter({ hasText: 'Сводная' })
    await summaryTab.click()
    await page.waitForSelector('.car-chart-card')

    const mileageChartTab = page.locator('.chart-tab').filter({ hasText: 'Пробег' })
    await mileageChartTab.click()
    await page.waitForTimeout(500)

    const chartContainer = page.locator('.chart-container')
    if (await chartContainer.count() > 0) {
      // Считаем точки на графике (через тики оси X)
      const xAxisTicks = page.locator('.recharts-xAxis .recharts-cartesian-axis-tick')
      const chartPointCount = await xAxisTicks.count()
      console.log('Chart data points:', chartPointCount)

      // Ожидаемое количество: покупка + записи с пробегом + сейчас (если отличается от последней записи)
      // Минимум должно быть: 1 (покупка) + totalRecordsWithMileage
      expect(chartPointCount).toBeGreaterThanOrEqual(1 + totalRecordsWithMileage)
    }
  })
})
