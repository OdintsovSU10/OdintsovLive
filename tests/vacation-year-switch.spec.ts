import { test, expect } from '@playwright/test'

async function getOctoberBaseSalary(page: any): Promise<string> {
  const row = page.locator('.table-row').filter({ hasText: 'Октябрь' })
  // Второй span после названия месяца содержит base_salary
  const spans = await row.locator('> span').allTextContents()
  return spans[1] || '—'
}

test('Переключение года - нет фантомных данных', async ({ page }) => {
  await page.goto('/vacation-rate')
  await expect(page.locator('.vacation-rate-page')).toBeVisible()

  // Ждём загрузки 2025
  await page.locator('.year-select').selectOption('2025')
  await expect(page.locator('.months-table')).toBeVisible()
  await page.waitForTimeout(300)

  const oct2025 = await getOctoberBaseSalary(page)
  console.log(`Октябрь 2025: ${oct2025}`)

  // Переключаемся на 2024
  await page.locator('.year-select').selectOption('2024')

  // Сразу проверяем - не должно быть данных 2025
  const oct2024immediate = await getOctoberBaseSalary(page)
  console.log(`Октябрь 2024 (сразу): ${oct2024immediate}`)

  // Ждём загрузки
  await page.waitForTimeout(500)
  const oct2024loaded = await getOctoberBaseSalary(page)
  console.log(`Октябрь 2024 (загружено): ${oct2024loaded}`)

  // Возвращаемся на 2025
  await page.locator('.year-select').selectOption('2025')
  const oct2025immediate = await getOctoberBaseSalary(page)
  console.log(`Октябрь 2025 (сразу после возврата): ${oct2025immediate}`)

  // Проверяем фантомные данные - сразу после переключения не должны быть данные другого года
  const has2024DataIn2025 = oct2025immediate === oct2024loaded && oct2024loaded !== '—' && oct2024loaded !== oct2025
  if (has2024DataIn2025) {
    console.log('⚠️ ФАНТОМ: данные 2024 показаны при переключении на 2025!')
  }

  await page.waitForTimeout(500)
  const oct2025loaded = await getOctoberBaseSalary(page)
  console.log(`Октябрь 2025 (загружено): ${oct2025loaded}`)

  // После загрузки должны быть правильные данные
  expect(oct2025loaded).toBe(oct2025)

  // Если были фантомы - тест должен провалиться
  expect(has2024DataIn2025).toBe(false)
})
