import * as XLSX from 'xlsx'
import type { ParsedEmployee, ParsedTimesheetRow, ParsedTimesheetDay, TimesheetStatus, ParsedSalaryEntry } from '../types'

// Разбивка ФИО на части
export function splitFullName(fullName: string): { last_name: string; first_name: string; middle_name: string } {
  const parts = fullName.trim().split(/\s+/)
  return {
    last_name: parts[0] || '',
    first_name: parts[1] || '',
    middle_name: parts.slice(2).join(' ') || ''
  }
}

// Парсинг даты из Excel
export function parseExcelDate(value: unknown): string {
  if (!value) return new Date().toISOString().split('T')[0]

  // Excel serial number
  if (typeof value === 'number') {
    const date = new Date((value - 25569) * 86400 * 1000)
    return date.toISOString().split('T')[0]
  }

  const str = String(value)

  // DD.MM.YYYY
  const dotMatch = str.match(/(\d{2})\.(\d{2})\.(\d{4})/)
  if (dotMatch) {
    return `${dotMatch[3]}-${dotMatch[2]}-${dotMatch[1]}`
  }

  // DD/MM/YYYY
  const slashMatch = str.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}`
  }

  return new Date().toISOString().split('T')[0]
}

// Парсинг периода MM/YYYY
export function parsePeriod(value: unknown): { year: number; month: number } | null {
  if (!value) return null

  // Excel serial date
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date((value - 25569) * 86400 * 1000)
    const month = date.getUTCMonth() + 1
    const year = date.getUTCFullYear()
    if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) {
      return { year, month }
    }
  }

  // JS Date
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { year: value.getFullYear(), month: value.getMonth() + 1 }
  }

  const str = String(value).trim().toLowerCase()
  if (!str) return null

  // MM/YYYY | MM.YYYY | MM-YYYY | MM YYYY
  const monthYear = str.match(/^(\d{1,2})[\/.\-\s](\d{4})$/)
  if (monthYear) {
    const month = parseInt(monthYear[1], 10)
    const year = parseInt(monthYear[2], 10)
    if (month >= 1 && month <= 12) return { month, year }
  }

  // YYYY/MM | YYYY.MM | YYYY-MM | YYYY MM
  const yearMonth = str.match(/^(\d{4})[\/.\-\s](\d{1,2})$/)
  if (yearMonth) {
    const year = parseInt(yearMonth[1], 10)
    const month = parseInt(yearMonth[2], 10)
    if (month >= 1 && month <= 12) return { month, year }
  }

  // DD/MM/YYYY or DD.MM.YYYY
  const dayMonthYear = str.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/)
  if (dayMonthYear) {
    const month = parseInt(dayMonthYear[2], 10)
    const year = parseInt(dayMonthYear[3], 10)
    if (month >= 1 && month <= 12) return { month, year }
  }

  // YYYY-MM-DD
  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) {
    const year = parseInt(iso[1], 10)
    const month = parseInt(iso[2], 10)
    if (month >= 1 && month <= 12) return { month, year }
  }

  // Русские месяцы: "январь 2026", "янв 2026", "февр. 2026"
  const monthWordMap: Record<string, number> = {
    'январь': 1, 'янв': 1,
    'февраль': 2, 'фев': 2, 'февр': 2,
    'март': 3, 'мар': 3,
    'апрель': 4, 'апр': 4,
    'май': 5,
    'июнь': 6, 'июн': 6,
    'июль': 7, 'июл': 7,
    'август': 8, 'авг': 8,
    'сентябрь': 9, 'сен': 9, 'сент': 9,
    'октябрь': 10, 'окт': 10,
    'ноябрь': 11, 'ноя': 11,
    'декабрь': 12, 'дек': 12
  }

  const cleaned = str.replace('.', ' ').replace(',', ' ').replace(/\s+/g, ' ').trim()
  const wordYear = cleaned.match(/^([а-яё]+)\s+(\d{4})$/i)
  if (wordYear) {
    const word = wordYear[1].toLowerCase()
    const year = parseInt(wordYear[2], 10)
    const month = monthWordMap[word]
    if (month) return { month, year }
  }

  return null
}

// Парсинг ячейки табеля
export function parseTimesheetCell(value: string): { status: TimesheetStatus; hours: number | null; is_correction: boolean } {
  const upper = value.toUpperCase().trim()

  if (!upper) {
    return { status: 'dayoff', hours: null, is_correction: false }
  }

  // Выходной
  if (upper === 'В') {
    return { status: 'dayoff', hours: null, is_correction: false }
  }

  // Удалёнка
  if (upper === 'У') {
    return { status: 'remote', hours: 8, is_correction: false }
  }

  // Отпуск
  if (upper === 'ОТ') {
    return { status: 'vacation', hours: null, is_correction: false }
  }

  // Отпуск за свой счёт
  if (upper === 'ДО') {
    return { status: 'unpaid', hours: null, is_correction: false }
  }

  // Рабочий день: "Я 09:15" или "Я 9:15" или "Я 09:15Кор"
  const workMatch = upper.match(/^Я\s*(\d{1,2}):?(\d{2})?\s*(КОР)?/i)
  if (workMatch) {
    const hours = parseInt(workMatch[1], 10)
    const minutes = parseInt(workMatch[2] || '0', 10)
    const totalHours = hours + minutes / 60
    const is_correction = !!workMatch[3]

    return { status: 'work', hours: Math.round(totalHours * 100) / 100, is_correction }
  }

  // Просто число (часы)
  const numMatch = value.match(/^(\d+(?:[.,]\d+)?)/)
  if (numMatch) {
    const hours = parseFloat(numMatch[1].replace(',', '.'))
    return { status: 'work', hours, is_correction: false }
  }

  return { status: 'absent', hours: null, is_correction: false }
}

// Парсинг списка сотрудников
export async function parseEmployeesExcel(file: File): Promise<ParsedEmployee[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

        // Пропускаем заголовок и строки с названиями колонок
        const dataRows = rows.slice(1).filter(row => {
          if (!Array.isArray(row) || row.length === 0 || !row[0]) return false
          const firstCell = String(row[0]).toLowerCase()
          // Пропускаем строки-заголовки
          if (firstCell.includes('фио') || firstCell.includes('имя') || firstCell.includes('name')) return false
          return true
        })

        const employees: ParsedEmployee[] = dataRows.map(row => {
          const r = row as unknown[]
          const fullName = String(r[0] || '').trim()
          const nameParts = splitFullName(fullName)

          return {
            full_name: fullName,
            last_name: nameParts.last_name,
            first_name: nameParts.first_name,
            middle_name: nameParts.middle_name,
            position: String(r[1] || '').trim(),
            department: String(r[2] || '').trim(),
            subdivision: String(r[3] || '').trim(),
            hire_date: parseExcelDate(r[4]),
            birth_date: r[5] ? parseExcelDate(r[5]) : null,
            salary: parseFloat(String(r[6] || '0').replace(/\s/g, '').replace(',', '.')) || 0,
            country: String(r[7] || 'Россия').trim(),
            snils: String(r[8] || '').trim(),
            company: String(r[9] || '').trim(),
            email: String(r[10] || '').trim(),
            phone: String(r[11] || '').trim()
          }
        })

        resolve(employees)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

// Парсинг табеля
export async function parseTimesheetExcel(file: File): Promise<ParsedTimesheetRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })

        const result: ParsedTimesheetRow[] = []
        const seen = new Set<string>()

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName]
          if (!sheet) continue

          const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
          if (!Array.isArray(rows) || rows.length === 0) continue

          // Данные начинаются с 4-й строки (индекс 3)
          const dataRows = rows.slice(3).filter(row => Array.isArray(row) && row.length > 0 && row[0])

          for (const row of dataRows) {
            const r = row as unknown[]
            const employeeName = String(r[0] || '').trim()
            if (!employeeName) continue

            // Период из столбца B (индекс 1)
            const period = parsePeriod(r[1])
            if (!period) continue

            const { year, month } = period
            const daysInMonth = new Date(year, month, 0).getDate()
            const key = `${normalizeNameForComparison(employeeName)}|${year}|${month}`
            if (seen.has(key)) {
              continue
            }

            const days: ParsedTimesheetDay[] = []
            // Столбцы дней начинаются с N (индекс 13)
            const startCol = 13

            for (let day = 1; day <= daysInMonth; day++) {
              const cellIndex = startCol + day - 1
              const cellValue = String(r[cellIndex] || '').trim()
              const parsed = parseTimesheetCell(cellValue)
              days.push({
                day,
                status: parsed.status,
                hours: parsed.hours,
                is_correction: parsed.is_correction
              })
            }

            result.push({
              employee_name: employeeName,
              year,
              month,
              days
            })
            seen.add(key)
          }
        }

        if (result.length === 0) {
          reject(new Error(
            'Не удалось распознать строки табеля. Проверьте: на рабочих листах данные начинаются с 4-й строки, в колонке B указан период (например, 01/2026), а ФИО заполнено в колонке A.'
          ))
          return
        }

        resolve(result)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

// Нормализация ФИО для сравнения
export function normalizeNameForComparison(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim()
}

// Извлечение фамилии для сопоставления
export function extractLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return normalizeNameForComparison(parts[0] || '')
}

// Маппинг месяцев RU -> номер
const MONTHS_RU: Record<string, number> = {
  'январь': 1, 'февраль': 2, 'март': 3, 'апрель': 4, 'май': 5, 'июнь': 6,
  'июль': 7, 'август': 8, 'сентябрь': 9, 'октябрь': 10, 'ноябрь': 11, 'декабрь': 12
}

// Регулярка для парсинга строки оклада
const SALARY_REGEX = /(Текущий оклад|[Ии]зменение оклада|Оклад при приеме)[^:]*:\s*([А-Яа-яЁё]+)\s+(\d{4})\s*=\s*([\d\s,\.]+)/i

// Регулярка для ФИО (Фамилия И.О. или Фамилия И.)
const NAME_REGEX = /^([А-ЯЁа-яё-]+)\s+([А-ЯЁ])\.(?:([А-ЯЁ])\.?)?$/

// Парсинг истории окладов из Excel
export async function parseSalaryHistoryExcel(file: File): Promise<ParsedSalaryEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

        const result: ParsedSalaryEntry[] = []
        let currentEmployee: string | null = null

        for (const row of rows) {
          if (!Array.isArray(row) || row.length < 2) continue

          // Данные во втором столбце (индекс 1)
          const cellValue = String(row[1] || '').trim()
          if (!cellValue) continue

          // Проверяем, это ФИО сотрудника? (Фамилия И.О. или Фамилия И. + есть дата в 3 столбце)
          const nameMatch = cellValue.match(NAME_REGEX)
          if (nameMatch && row[2]) {
            // Поддержка 1 или 2 инициалов
            currentEmployee = nameMatch[3]
              ? `${nameMatch[1]} ${nameMatch[2]}.${nameMatch[3]}.`
              : `${nameMatch[1]} ${nameMatch[2]}.`
            continue
          }

          // Проверяем, это строка с окладом?
          const salaryMatch = cellValue.match(SALARY_REGEX)
          if (salaryMatch && currentEmployee) {
            const type = salaryMatch[1].toLowerCase()
            const monthStr = salaryMatch[2].toLowerCase()
            const year = parseInt(salaryMatch[3], 10)
            const salaryStr = salaryMatch[4].replace(/\s/g, '').replace(',', '.')
            const salary = parseFloat(salaryStr)

            const month = MONTHS_RU[monthStr]
            if (!month || isNaN(salary)) continue

            const effective_date = `${year}-${String(month).padStart(2, '0')}-01`

            let note = 'Изменение оклада'
            if (type.includes('текущий')) note = 'Текущий оклад'
            else if (type.includes('приеме')) note = 'Оклад при приёме'

            result.push({
              employee_name: currentEmployee,
              salary,
              effective_date,
              note
            })
          }
        }

        resolve(result)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}
