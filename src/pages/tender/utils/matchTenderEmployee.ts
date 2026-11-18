import type { ParsedEmployee } from '../types'

export interface ITenderEmployeeRef {
  id: string
  full_name: string
  fot_employee_id: string | null
  is_archived: boolean
}

const normalizeName = (value: string): string =>
  value.trim().replace(/\s+/g, ' ').toLowerCase().replace(/ё/g, 'е')

const normalizeSurname = (value: string): string =>
  value.trim().toLowerCase().replace(/ё/g, 'е')

export const matchTenderEmployee = (
  emp: ParsedEmployee,
  list: ITenderEmployeeRef[]
): ITenderEmployeeRef | null => {
  const fotId = emp.fot_employee_id?.trim()
  if (fotId) {
    const byFotId = list.find(item => item.fot_employee_id === fotId)
    if (byFotId) return byFotId
  }

  const fullName = normalizeName(emp.full_name)
  if (fullName) {
    const byName = list.find(item => normalizeName(item.full_name) === fullName)
    if (byName) return byName
  }

  const surname = normalizeSurname(emp.last_name)
  if (surname) {
    const bySurname = list.find(item => normalizeSurname(item.full_name).startsWith(surname))
    if (bySurname) return bySurname
  }

  return null
}
