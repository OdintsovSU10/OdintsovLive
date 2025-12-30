import { test } from '@playwright/test'

test('Настройки октября 2025', async ({ page }) => {
  await page.goto('/salary/2025/9')
  await page.waitForTimeout(1000)

  const salary = await page.locator('.settings-row').filter({ hasText: 'Оклад' }).locator('input').inputValue()
  const bonus = await page.locator('.settings-row').filter({ hasText: 'Премия' }).locator('input').inputValue()
  const normDays = await page.locator('.settings-row').filter({ hasText: 'Рабочих дней' }).locator('input').inputValue()
  const transport = await page.locator('.month-section').nth(1).locator('.settings-row').filter({ hasText: 'Базовая стоимость' }).locator('input').inputValue()

  const workDays = await page.locator('.stat-item:not(.worked):not(.vacation) .stat-value').textContent()
  const weekendDays = await page.locator('.stat-item.worked .stat-value').textContent()
  const vacationDays = await page.locator('.stat-item.vacation .stat-value').textContent()

  console.log('=== Настройки октября ===')
  console.log(`Оклад: ${salary}`)
  console.log(`Премия: ${bonus}`)
  console.log(`Норма дней: ${normDays}`)
  console.log(`Транспорт: ${transport}`)
  console.log(`Рабочих: ${workDays}`)
  console.log(`Выходных: ${weekendDays}`)
  console.log(`Отпуск: ${vacationDays}`)

  // Вычислим что должно быть в vacation_rate.base_salary
  const salaryNum = parseInt(salary?.replace(/\s/g, '') || '0')
  const normNum = parseInt(normDays || '22')
  const workNum = parseInt(workDays || '0')
  const weekendNum = parseInt(weekendDays || '0')
  const transportNum = parseInt(transport?.replace(/\s/g, '') || '0')

  const dailyRate = salaryNum / normNum
  const transportDaily = transportNum / normNum
  const forWork = Math.round(dailyRate * workNum)
  const forWeekend = Math.round(dailyRate * weekendNum)
  const forTransport = Math.round(transportDaily * workNum)

  console.log('\n=== Расчёт ===')
  console.log(`Дневная ставка: ${Math.round(dailyRate)}`)
  console.log(`За работу: ${forWork}`)
  console.log(`За выходные: ${forWeekend}`)
  console.log(`Транспорт: ${forTransport}`)
  console.log(`Всего (без отпускных): ${forWork + forWeekend + forTransport}`)
})
