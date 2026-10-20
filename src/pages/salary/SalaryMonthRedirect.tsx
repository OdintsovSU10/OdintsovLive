import { Navigate, useParams } from 'react-router-dom'

// Старый адрес страницы месяца: теперь месяц раскрывается в обзоре
export default function SalaryMonthRedirect() {
  const { year, month } = useParams()
  return <Navigate to={`/salary?year=${year}&month=${month}`} replace />
}
