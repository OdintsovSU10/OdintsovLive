// Цвет системной полосы (meta theme-color) держим равным цвету шапки и фона страницы.
// В index.html метатеги привязаны к системной схеме, а тема в приложении выбирается вручную.
export function syncThemeColor(): void {
  const color = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim()
  if (!color) return

  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(meta => {
    meta.removeAttribute('media')
    meta.content = color
  })
}
