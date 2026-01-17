import * as XLSX from 'xlsx'

export function readExcelFile(file: File): Promise<unknown[][]> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (evt) => {
      const data = evt.target?.result
      const workbook = XLSX.read(data, { type: 'binary' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
      resolve(rows)
    }
    reader.readAsBinaryString(file)
  })
}

export function parseExcelDate(raw: unknown): string | null {
  if (!raw) return null
  if (typeof raw === 'number') {
    const date = XLSX.SSF.parse_date_code(raw)
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
  }
  return String(raw)
}
