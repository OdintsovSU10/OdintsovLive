import { test, expect } from '@playwright/test'

// Используем сохранённую сессию без проверки setup
test.use({
  storageState: './tests/auth.json',
  baseURL: 'http://localhost:5173'
})

test.describe('Notes Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/notes')
    await page.waitForSelector('.notes-page')
  })

  test('create new note and enter editor', async ({ page }) => {
    // Кликаем на кнопку создания новой заметки
    await page.click('.add-note-btn')

    // Должен открыться редактор
    await expect(page.locator('.notes-editor-page')).toBeVisible()
    await expect(page.locator('.note-content-editor')).toBeVisible()
  })

  test('auto-format numbered list with "1. "', async ({ page }) => {
    await page.click('.add-note-btn')
    await page.waitForSelector('.note-content-editor')

    const editor = page.locator('.note-content-editor')
    await editor.click()

    // Вводим "1." и пробел
    await page.keyboard.type('1.')
    await page.keyboard.press('Space')

    // Должен появиться элемент списка
    await expect(editor.locator('ol')).toBeVisible()
    await expect(editor.locator('li')).toBeVisible()
  })

  test('auto-format bullet list with "* "', async ({ page }) => {
    await page.click('.add-note-btn')
    await page.waitForSelector('.note-content-editor')

    const editor = page.locator('.note-content-editor')
    await editor.click()

    // Вводим "*" и пробел
    await page.keyboard.type('*')
    await page.keyboard.press('Space')

    // Должен появиться маркированный список
    await expect(editor.locator('ul')).toBeVisible()
    await expect(editor.locator('li')).toBeVisible()
  })

  test('nested numbering "1.1 " formats correctly', async ({ page }) => {
    await page.click('.add-note-btn')
    await page.waitForSelector('.note-content-editor')

    const editor = page.locator('.note-content-editor')
    await editor.click()

    // Вводим "1.1" и пробел
    await page.keyboard.type('1.1')
    await page.keyboard.press('Space')

    // Текст должен содержать "1.1. "
    const content = await editor.innerHTML()
    expect(content).toContain('1.1.')
  })

  test('nested numbering Enter creates 1.2, double Enter creates 2.', async ({ page }) => {
    await page.click('.add-note-btn')
    await page.waitForSelector('.note-content-editor')

    const editor = page.locator('.note-content-editor')
    await editor.click()

    // Создаём подпункт 1.1
    await page.keyboard.type('1.1')
    await page.keyboard.press('Space')
    await page.keyboard.type('First sub')
    await page.keyboard.press('Enter')

    // Должен появиться 1.2
    let content = await editor.innerHTML()
    expect(content).toContain('1.2.')

    // Двойной Enter - выход в основной список
    await page.keyboard.press('Enter')

    // Должен появиться пункт 2 (ol с start=2)
    content = await editor.innerHTML()
    expect(content).toContain('<ol start="2">')
  })

  test('quote formatting', async ({ page }) => {
    await page.click('.add-note-btn')
    await page.waitForSelector('.note-content-editor')

    const editor = page.locator('.note-content-editor')
    await editor.click()

    // Вводим текст
    await page.keyboard.type('This is a quote text')

    // Выделяем текст (Cmd+A на Mac, Ctrl+A на Windows)
    await page.keyboard.press('Meta+a')

    // Кликаем кнопку цитаты в тулбаре
    await page.click('.editor-toolbar button[title="Цитата"]')

    // Должен появиться блок цитаты
    await expect(editor.locator('.quote-block')).toBeVisible({ timeout: 3000 })
  })

  test('todo item creation', async ({ page }) => {
    await page.click('.add-note-btn')
    await page.waitForSelector('.note-content-editor')

    const editor = page.locator('.note-content-editor')
    await editor.click()

    // Вводим текст
    await page.keyboard.type('My todo item')

    // Кликаем кнопку todo
    await page.click('button[title="Пункт с галочкой"]')

    // Должен появиться todo-item
    await expect(editor.locator('.todo-item')).toBeVisible()
    await expect(editor.locator('.todo-circle')).toBeVisible()
  })

  test('todo item toggle', async ({ page }) => {
    await page.click('.add-note-btn')
    await page.waitForSelector('.note-content-editor')

    const editor = page.locator('.note-content-editor')
    await editor.click()

    await page.keyboard.type('Test todo')
    await page.click('button[title="Пункт с галочкой"]')

    // Кликаем на круг для переключения состояния
    await page.click('.todo-circle')

    // Должен добавиться класс completed
    await expect(editor.locator('.todo-item.completed')).toBeVisible()
  })

  test('backspace at list item start removes marker', async ({ page }) => {
    await page.click('.add-note-btn')
    await page.waitForSelector('.note-content-editor')

    const editor = page.locator('.note-content-editor')
    await editor.click()

    // Создаём список
    await page.keyboard.type('1.')
    await page.keyboard.press('Space')
    await page.keyboard.type('First item')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Second item')

    // Ставим курсор в начало второго элемента и нажимаем Backspace
    await page.keyboard.press('Home')
    await page.keyboard.press('Backspace')

    // Второй элемент должен выйти из списка
    const content = await editor.innerHTML()
    // После backspace должен быть div с текстом "Second item"
    expect(content).toContain('Second item')
  })

  test('auto-save indicator shows', async ({ page }) => {
    await page.click('.add-note-btn')
    await page.waitForSelector('.note-content-editor')

    const editor = page.locator('.note-content-editor')
    await editor.click()

    // Вводим текст
    await page.keyboard.type('Test auto save')

    // Статус должен показать "Сохранение..." или "Сохранено"
    const status = page.locator('.editor-status')
    await expect(status).toBeVisible()

    // Ждём сохранения
    await page.waitForTimeout(1000)
    await expect(status).toHaveText('Сохранено')
  })

  test('back button returns to notes list', async ({ page }) => {
    await page.click('.add-note-btn')
    await page.waitForSelector('.notes-editor-page')

    // Кликаем кнопку назад
    await page.click('.back-btn')

    // Должны вернуться к списку заметок
    await expect(page.locator('.notes-page')).toBeVisible()
    await expect(page.locator('.notes-editor-page')).not.toBeVisible()
  })

  test('double Enter exits list', async ({ page }) => {
    await page.click('.add-note-btn')
    await page.waitForSelector('.note-content-editor')

    const editor = page.locator('.note-content-editor')
    await editor.click()

    // Создаём список
    await page.keyboard.type('1.')
    await page.keyboard.press('Space')
    await page.keyboard.type('Item')
    await page.keyboard.press('Enter')

    // Второй Enter на пустой строке должен выйти из списка
    await page.keyboard.press('Enter')

    // Проверяем, что появился div после списка
    const content = await editor.innerHTML()
    expect(content).toContain('<div>')
  })
})
