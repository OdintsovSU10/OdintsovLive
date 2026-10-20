import type { ReactNode } from 'react'
import { Briefcase, Mail, Phone, PhoneCall, UserRound, Wallet, type LucideIcon } from 'lucide-react'
import { BottomSheet } from '../../../../components/ui/BottomSheet'
import { formatRuPhone } from '../../../../lib/formatUtils'
import './EmployeeInfo.css'
import { formatRub, MONTH_GENITIVE, parseIsoDate } from '../../utils/employeeFormat'
import { formatAgeYears, formatMonthsSinceRaise } from '../../utils/tenderPresentation'
import type { EmployeeWithStats } from '../../types'

interface InfoRow {
  label: string
  value: string
}

interface Props {
  employee: EmployeeWithStats
  initials: string
  ageYears: number | null
  tenureMonths: number
  noRaiseMonths: number
  onClose: () => void
}

// «12 марта 2024»; пустая или неразобранная дата — пустая строка
function formatLongDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = parseIsoDate(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getDate()} ${MONTH_GENITIVE[date.getMonth()]} ${date.getFullYear()}`
}

function pickRows(rows: Array<InfoRow | null>): InfoRow[] {
  return rows.filter((row): row is InfoRow => row !== null && row.value.trim() !== '')
}

function row(label: string, value: string | null | undefined): InfoRow | null {
  const text = (value || '').trim()
  return text ? { label, value: text } : null
}

function InfoSection({ title, icon: Icon, children }: {
  title: string
  icon: LucideIcon
  children: ReactNode
}) {
  return (
    <section className="emp-info-section">
      <h3><Icon size={16} aria-hidden="true" />{title}</h3>
      {children}
    </section>
  )
}

function InfoList({ rows }: { rows: InfoRow[] }) {
  return (
    <dl className="emp-info-list">
      {rows.map(item => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function EmployeeInfoSheet({ employee, initials, ageYears, tenureMonths, noRaiseMonths, onClose }: Props) {
  const phoneText = formatRuPhone(employee.phone)
  const phoneHref = (employee.phone || '').replace(/[^\d+]/g, '')
  const email = (employee.email || '').trim()
  const hireText = formatLongDate(employee.hire_date)

  const workRows = pickRows([
    row('Отдел', employee.department),
    row('Подразделение', employee.subdivision),
    row('Компания', employee.company),
    row('Группа', employee.group_name),
    row('Табельный №', employee.tab_number),
    hireText ? { label: 'Дата приёма', value: `с ${hireText}` } : null,
    tenureMonths > 0 || hireText ? { label: 'Стаж', value: formatMonthsSinceRaise(tenureMonths) } : null
  ])
  const personalRows = pickRows([
    row('Дата рождения', formatLongDate(employee.birth_date)),
    ageYears !== null ? { label: 'Возраст', value: formatAgeYears(ageYears) } : null,
    row('Страна', employee.country)
  ])
  const salaryRows = pickRows([
    employee.current_salary > 0 ? { label: 'Базовый оклад', value: formatRub(employee.current_salary) } : null,
    employee.monthly_bonus > 0 ? { label: 'Ежемесячный бонус', value: formatRub(employee.monthly_bonus) } : null,
    noRaiseMonths > 0 ? { label: 'Без повышения', value: formatMonthsSinceRaise(noRaiseMonths) } : null
  ])
  const hasContacts = phoneHref !== '' || email !== ''

  return (
    <BottomSheet variant="modal" title="О сотруднике" onClose={onClose}>
      <div className="emp-info">
        <div className="emp-info-person">
          <span className="emp-info-avatar" aria-hidden="true">{initials}</span>
          <div>
            <p className="emp-info-name">{employee.full_name}</p>
            {employee.position && <p className="emp-info-position">{employee.position}</p>}
          </div>
        </div>

        <div className="emp-info-grid">
          {hasContacts && (
            <InfoSection title="Контакты" icon={Phone}>
              {phoneHref && (
                <div className="emp-info-contact">
                  <a className="emp-info-phone" href={`tel:${phoneHref}`}>{phoneText}</a>
                  <a className="emp-info-call" href={`tel:${phoneHref}`}>
                    <PhoneCall size={16} aria-hidden="true" />
                    Позвонить
                  </a>
                </div>
              )}
              {email && (
                <a className="emp-info-mail" href={`mailto:${email}`}>
                  <Mail size={16} aria-hidden="true" />
                  <span>{email}</span>
                </a>
              )}
            </InfoSection>
          )}
          {workRows.length > 0 && (
            <InfoSection title="Работа" icon={Briefcase}>
              <InfoList rows={workRows} />
            </InfoSection>
          )}
          {personalRows.length > 0 && (
            <InfoSection title="Личное" icon={UserRound}>
              <InfoList rows={personalRows} />
            </InfoSection>
          )}
          {salaryRows.length > 0 && (
            <InfoSection title="Оклад" icon={Wallet}>
              <InfoList rows={salaryRows} />
            </InfoSection>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}
