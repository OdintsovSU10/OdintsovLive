import { ChevronDown, ChevronUp } from 'lucide-react'
import type { EmployeeSortKey, IEmployeeSort } from '../utils/employeeListSort'

interface Props {
  label: string
  sortKey: EmployeeSortKey
  sort: IEmployeeSort | null
  onSort: (key: EmployeeSortKey) => void
}

// Заголовок колонки с сортировкой: кнопка внутри th, направление — в aria-sort и иконкой
export const SortableTh = ({ label, sortKey, sort, onSort }: Props) => {
  const active = sort?.key === sortKey
  const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
  return (
    <th aria-sort={ariaSort}>
      <button type="button" className={`admin-sort-btn${active ? ' active' : ''}`} onClick={() => onSort(sortKey)}>
        {label}
        {active && (sort.dir === 'asc'
          ? <ChevronUp size={12} strokeWidth={2} aria-hidden="true" />
          : <ChevronDown size={12} strokeWidth={2} aria-hidden="true" />)}
      </button>
    </th>
  )
}
