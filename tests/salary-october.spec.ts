import { test, expect } from '@playwright/test'

test.describe('Зарплата - Октябрь 2025', () => {
  test('Сумма "Начислено" совпадает на странице списка и детальной', async ({ page }) => {
    // Переходим на страницу зарплаты
    await page.goto('/salary')
    await expect(page.locator('.salary-page')).toBeVisible()

    // Выбираем 2025 год
    await page.locator('.year-select').selectOption('2025')
    await page.waitForTimeout(500)

    // Находим строку Октября (индекс 9)
    const octoberRow = page.locator('.month-row').filter({ hasText: 'Октябрь' })
    await expect(octoberRow).toBeVisible()

    // Получаем сумму "Начислено" из списка
    const earnedInList = await octoberRow.locator('.month-earned').textContent()
    console.log('Начислено в списке:', earnedInList)

    // Переходим на детальную страницу октября
    await octoberRow.click()
    await expect(page.locator('.salary-month-page')).toBeVisible()
    await expect(page.locator('h1')).toContainText('Октябрь 2025')

    // Находим сумму "Начислено" на детальной странице
    const earnedRow = page.locator('.calc-item.total')
    await expect(earnedRow).toBeVisible()
    const earnedInDetail = await earnedRow.locator('span:last-child').textContent()
    console.log('Начислено на детальной:', earnedInDetail)

    // Сравниваем суммы
    expect(earnedInList?.trim()).toBe(earnedInDetail?.trim())
  })

  test('Детальная страница октября показывает корректные расчёты', async ({ page }) => {
    await page.goto('/salary/2025/9')
    await expect(page.locator('.salary-month-page')).toBeVisible()
    await expect(page.locator('h1')).toContainText('Октябрь 2025')

    // Проверяем наличие секций
    await expect(page.locator('.section-title').filter({ hasText: 'Настройки' })).toBeVisible()
    await expect(page.locator('.section-title').filter({ hasText: 'Расчёт' })).toBeVisible()
    await expect(page.locator('.section-title').filter({ hasText: 'Выплаты' })).toBeVisible()

    // Получаем данные для расчёта
    const salaryInput = page.locator('.settings-row').filter({ hasText: 'Оклад' }).locator('input')
    const salary = parseFloat((await salaryInput.inputValue()).replace(/\s/g, '').replace(',', '.')) || 0

    const normDaysInput = page.locator('.settings-row').filter({ hasText: 'Рабочих дней (норма)' }).locator('input')
    const normDays = parseFloat(await normDaysInput.inputValue()) || 22

    const dailyRateText = await page.locator('.month-section').first().locator('.settings-row').filter({ hasText: 'Ставка за день' }).locator('.settings-value').textContent()
    const dailyRate = parseFloat(dailyRateText?.replace(/[^\d,]/g, '').replace(',', '.') || '0')

    // Проверяем расчёт дневной ставки
    const expectedDailyRate = Math.round(salary / normDays)
    expect(dailyRate).toBe(expectedDailyRate)

    // Получаем итоговую сумму
    const totalEarnedText = await page.locator('.calc-item.total span:last-child').textContent()
    const totalEarned = parseFloat(totalEarnedText?.replace(/[^\d,]/g, '').replace(',', '.') || '0')

    console.log(`Оклад: ${salary}, Норма дней: ${normDays}, Дневная ставка: ${dailyRate}, Итого: ${totalEarned}`)

    // Проверяем что итоговая сумма не нулевая (если есть рабочие дни)
    const workDaysText = await page.locator('.stat-item:not(.worked):not(.vacation) .stat-value').textContent()
    const workDays = parseInt(workDaysText || '0')

    if (workDays > 0) {
      expect(totalEarned).toBeGreaterThan(0)
    }
  })
})
