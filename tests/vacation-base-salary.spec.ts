import { test, expect } from '@playwright/test'

test('Выплаты (отпускные) = Начислено - Отпускные (октябрь 2025)', async ({ page }) => {
  // Получаем данные со страницы зарплаты
  await page.goto('/salary/2025/9')
  await expect(page.locator('.salary-month-page')).toBeVisible()
  await expect(page.locator('.calc-item.total')).toBeVisible({ timeout: 5000 })

  const earnedText = await page.locator('.calc-item.total span:last-child').textContent()
  const earned = parseInt(earnedText?.replace(/[^\d]/g, '') || '0')

  // Получаем отпускные
  const vacationRow = page.locator('.calc-item').filter({ hasText: 'Отпускные' })
  let vacationPay = 0
  if (await vacationRow.isVisible()) {
    const vacText = await vacationRow.locator('span:last-child').textContent()
    vacationPay = parseInt(vacText?.replace(/[^\d]/g, '') || '0')
  }

  const expectedBaseSalary = earned - vacationPay
  console.log(`Начислено: ${earned} ₽`)
  console.log(`Отпускные: ${vacationPay} ₽`)
  console.log(`Ожидаемые выплаты: ${expectedBaseSalary} ₽`)

  // Получаем "Выплаты" со страницы отпускных
  await page.goto('/vacation-rate')
  await expect(page.locator('.vacation-rate-page')).toBeVisible()
  await page.locator('.year-select').selectOption('2025')
  await expect(page.locator('.table-row').first()).toBeVisible()

  const octoberRow = page.locator('.table-row').filter({ hasText: 'Октябрь' })
  const baseSalaryText = await octoberRow.locator('span:nth-child(2)').textContent()
  const baseSalary = parseInt(baseSalaryText?.replace(/[^\d]/g, '') || '0')
  console.log(`Выплаты (отпускные): ${baseSalary} ₽`)

  // Выплаты = Начислено - Отпускные (допуск ±2 на округление)
  expect(Math.abs(baseSalary - expectedBaseSalary)).toBeLessThanOrEqual(2)
})
