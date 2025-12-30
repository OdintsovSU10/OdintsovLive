import { test } from '@playwright/test'

test('Проверка страницы отпускных октябрь', async ({ page }) => {
  await page.goto('/vacation-rate')
  await page.locator('.year-select').selectOption('2025')
  await page.waitForTimeout(1000)

  const octoberRow = page.locator('.table-row').filter({ hasText: 'Октябрь' })
  const cells = await octoberRow.locator('span').allTextContents()

  console.log('Ячейки строки Октябрь:')
  cells.forEach((c, i) => console.log(`  ${i}: "${c}"`))
})
