import { test, expect } from '@playwright/test'

test.describe('Зарплата vs Отпускные - Октябрь 2025', () => {
  test('Ставка отпускных совпадает на обеих страницах', async ({ page }) => {
    // Получаем ставку со страницы зарплаты (детальная октябрь)
    await page.goto('/salary/2025/9')
    await expect(page.locator('.salary-month-page')).toBeVisible()
    // Ждём загрузки данных
    await expect(page.locator('.calc-item.total')).toBeVisible({ timeout: 5000 })

    // Ищем строку с отпускными в расчёте
    const vacationCalcRow = page.locator('.calc-item').filter({ hasText: 'Отпускные' })
    let salaryVacationRate = 0
    let salaryVacationDays = 0
    let salaryVacationPayment = 0

    if (await vacationCalcRow.isVisible()) {
      const vacationText = await vacationCalcRow.locator('span:first-child').textContent()
      // Формат: "Отпускные (X × Y)"
      const match = vacationText?.match(/\((\d+)\s*×\s*([\d\s]+)\)/)
      if (match) {
        salaryVacationDays = parseInt(match[1])
        salaryVacationRate = parseInt(match[2].replace(/\s/g, ''))
      }
      const paymentText = await vacationCalcRow.locator('span:last-child').textContent()
      salaryVacationPayment = parseInt(paymentText?.replace(/[^\d]/g, '') || '0')
    }

    console.log(`Страница зарплаты: ${salaryVacationDays} дн × ${salaryVacationRate} ₽ = ${salaryVacationPayment} ₽`)

    // Переходим на страницу отпускных
    await page.goto('/vacation-rate')
    await expect(page.locator('.vacation-rate-page')).toBeVisible()

    // Выбираем 2025 год
    await page.locator('.year-select').selectOption('2025')
    await page.waitForTimeout(500)

    // Находим строку Октября
    const octoberRow = page.locator('.table-row').filter({ hasText: 'Октябрь' })
    await expect(octoberRow).toBeVisible()

    // Получаем дни отпуска и ставку
    const vacationDaysText = await octoberRow.locator('.vacation-days').textContent()
    const vacationDays = parseInt(vacationDaysText?.replace(/[^\d]/g, '') || '0')

    const rateText = await octoberRow.locator('.rate, .rate-input input').first().textContent()
      || await octoberRow.locator('.rate-input input').inputValue()
    const rate = parseInt(rateText?.replace(/[^\d]/g, '') || '0')

    console.log(`Страница отпускных: ${vacationDays} дн × ${rate} ₽`)

    // Сравниваем
    expect(salaryVacationDays).toBe(vacationDays)
    expect(salaryVacationRate).toBe(rate)

    // Проверяем расчёт (допускаем погрешность округления ±2 ₽)
    if (vacationDays > 0 && rate > 0) {
      const expected = vacationDays * rate
      expect(Math.abs(salaryVacationPayment - expected)).toBeLessThanOrEqual(2)
    }
  })

  test('Итого отпускных за год совпадает', async ({ page }) => {
    let totalFromSalary = 0

    // Проходим по каждому месяцу и собираем отпускные
    for (let i = 0; i < 12; i++) {
      await page.goto(`/salary/2025/${i}`)
      await expect(page.locator('.salary-month-page')).toBeVisible()
      await expect(page.locator('.calc-item.total')).toBeVisible({ timeout: 5000 })

      const vacationCalcRow = page.locator('.calc-item').filter({ hasText: 'Отпускные' })
      if (await vacationCalcRow.isVisible({ timeout: 500 }).catch(() => false)) {
        const paymentText = await vacationCalcRow.locator('span:last-child').textContent()
        const payment = parseInt(paymentText?.replace(/[^\d]/g, '') || '0')
        totalFromSalary += payment
      }
    }

    console.log(`Итого отпускных (зарплата): ${totalFromSalary} ₽`)

    // Получаем итого со страницы отпускных
    await page.goto('/vacation-rate')
    await expect(page.locator('.vacation-rate-page')).toBeVisible()
    await page.locator('.year-select').selectOption('2025')
    await expect(page.locator('.summary-card.highlight .summary-value')).not.toHaveText('—')

    const totalText = await page.locator('.summary-card.highlight .summary-value').textContent()
    const totalFromVacation = parseInt(totalText?.replace(/[^\d]/g, '') || '0')

    console.log(`Итого отпускных (отпускные): ${totalFromVacation} ₽`)

    // Допускаем погрешность округления (до 12 ₽ - по 1 на месяц)
    expect(Math.abs(totalFromSalary - totalFromVacation)).toBeLessThanOrEqual(12)
  })
})
