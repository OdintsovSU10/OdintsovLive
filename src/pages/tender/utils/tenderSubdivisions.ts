import { supabase } from '../../../lib/supabase'
import type { TenderSubdivision } from '../types'
import { normalizeSubdivisionName } from './adminTenderHelpers'

// Справочник плюс названия, которые есть только в карточках сотрудников (у них id < 0 — записи в справочнике нет)
export async function fetchSubdivisions(): Promise<TenderSubdivision[] | null> {
  const { data, error } = await supabase
    .from('tender_subdivisions')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    console.error('Error loading subdivisions:', error)
    return null
  }

  const byNormalizedName = new Map<string, TenderSubdivision>()
  ;((data || []) as TenderSubdivision[]).forEach(item => {
    const normalized = normalizeSubdivisionName(item.name)
    if (!normalized) return
    if (!byNormalizedName.has(normalized)) {
      byNormalizedName.set(normalized, item)
    }
  })

  const { data: employeeSubdivisionData } = await supabase
    .from('tender_employees')
    .select('subdivision')
    .not('subdivision', 'is', null)

  ;((employeeSubdivisionData || []) as Array<{ subdivision: string | null }>).forEach((row, index) => {
    const name = row.subdivision?.trim() || ''
    const normalized = normalizeSubdivisionName(name)
    if (!normalized || byNormalizedName.has(normalized)) return
    byNormalizedName.set(normalized, {
      id: -(index + 1),
      name,
      created_at: ''
    })
  })

  return Array.from(byNormalizedName.values())
    .sort((left, right) => left.name.localeCompare(right.name, 'ru-RU'))
}
