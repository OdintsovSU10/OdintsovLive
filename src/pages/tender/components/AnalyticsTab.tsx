import { useMemo } from 'react'
import { Users, Wallet, TrendingUp, Calendar, Award, UserPlus, Clock } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts'
import { Employee, SalaryHistory } from '../types'

interface AnalyticsTabProps {
  employees: Employee[]
  archivedEmployees: Employee[]
  salaryHistory: { [key: number]: SalaryHistory[] }
}

const COLORS = ['#C4A77D', '#6B99CC', '#65CC88', '#CC6B77', '#936BCC', '#CC9E6B', '#629FCC']

const formatMoney = (value: number) => {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)
}

export default function AnalyticsTab({ employees, archivedEmployees, salaryHistory }: AnalyticsTabProps) {
  const analytics = useMemo(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()

    // Базовые метрики
    const totalEmployees = employees.length
    const totalSalary = employees.reduce((sum, e) => sum + e.current_salary, 0)
    const avgSalary = totalEmployees > 0 ? totalSalary / totalEmployees : 0

    // Средний стаж
    const avgTenure = totalEmployees > 0
      ? employees.reduce((sum, e) => {
          const hire = new Date(e.hire_date)
          const years = (now.getTime() - hire.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
          return sum + years
        }, 0) / totalEmployees
      : 0

    // Распределение по группам
    const groupStats: { [key: string]: { count: number; salary: number } } = {}
    employees.forEach(e => {
      const group = e.group_name || 'Без группы'
      if (!groupStats[group]) groupStats[group] = { count: 0, salary: 0 }
      groupStats[group].count++
      groupStats[group].salary += e.current_salary
    })
    const groupData = Object.entries(groupStats).map(([name, data]) => ({
      name,
      value: data.count,
      salary: data.salary
    })).sort((a, b) => b.value - a.value)

    // Распределение по стажу
    const tenureBuckets = [
      { label: '< 1 года', min: 0, max: 1, count: 0 },
      { label: '1-2 года', min: 1, max: 2, count: 0 },
      { label: '2-3 года', min: 2, max: 3, count: 0 },
      { label: '3-5 лет', min: 3, max: 5, count: 0 },
      { label: '5+ лет', min: 5, max: 100, count: 0 }
    ]
    employees.forEach(e => {
      const hire = new Date(e.hire_date)
      const years = (now.getTime() - hire.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      const bucket = tenureBuckets.find(b => years >= b.min && years < b.max)
      if (bucket) bucket.count++
    })

    // Динамика ФОТ по месяцам (последние 12 месяцев)
    const fotHistory: { month: string; fot: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const date = new Date(currentYear, currentMonth - i, 1)
      const monthKey = date.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' })

      // Считаем ФОТ на конец месяца
      let monthFot = 0
      employees.forEach(e => {
        const hireDate = new Date(e.hire_date)
        if (hireDate <= date) {
          // Ищем актуальную зарплату на эту дату
          const history = salaryHistory[e.id] || []
          const relevantHistory = history
            .filter(h => new Date(h.effective_date) <= date)
            .sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime())

          if (relevantHistory.length > 0) {
            monthFot += relevantHistory[0].salary
          } else {
            monthFot += e.current_salary
          }
        }
      })
      fotHistory.push({ month: monthKey, fot: monthFot })
    }

    // Топ зарплат
    const topSalaries = [...employees]
      .sort((a, b) => b.current_salary - a.current_salary)
      .slice(0, 5)

    // Новые сотрудники (за последние 90 дней)
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    const newHires = employees
      .filter(e => new Date(e.hire_date) >= threeMonthsAgo)
      .sort((a, b) => new Date(b.hire_date).getTime() - new Date(a.hire_date).getTime())

    // Ближайшие дни рождения (30 дней)
    const upcomingBirthdays = employees
      .filter(e => e.birth_date)
      .map(e => {
        const bd = new Date(e.birth_date!)
        const thisYearBd = new Date(currentYear, bd.getMonth(), bd.getDate())
        if (thisYearBd < now) thisYearBd.setFullYear(currentYear + 1)
        const daysUntil = Math.ceil((thisYearBd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        return { ...e, daysUntil, nextBirthday: thisYearBd }
      })
      .filter(e => e.daysUntil <= 30 && e.daysUntil >= 0)
      .sort((a, b) => a.daysUntil - b.daysUntil)

    // Текучесть за год
    const yearAgo = new Date(currentYear - 1, currentMonth, 1)
    const hiredThisYear = employees.filter(e => new Date(e.hire_date) >= yearAgo).length
    const archivedThisYear = archivedEmployees.filter(e =>
      e.archived_at && new Date(e.archived_at) >= yearAgo
    ).length

    // Рост ФОТ
    const fotGrowth = fotHistory.length >= 2
      ? ((fotHistory[fotHistory.length - 1].fot - fotHistory[0].fot) / fotHistory[0].fot * 100)
      : 0

    return {
      totalEmployees,
      totalSalary,
      avgSalary,
      avgTenure,
      groupData,
      tenureBuckets,
      fotHistory,
      topSalaries,
      newHires,
      upcomingBirthdays,
      hiredThisYear,
      archivedThisYear,
      fotGrowth
    }
  }, [employees, archivedEmployees, salaryHistory])

  return (
    <div className="analytics-tab">
      {/* KPI карточки */}
      <div className="analytics-kpi">
        <div className="kpi-card">
          <div className="kpi-icon"><Users size={24} /></div>
          <div className="kpi-content">
            <span className="kpi-value">{analytics.totalEmployees}</span>
            <span className="kpi-label">Сотрудников</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon"><Wallet size={24} /></div>
          <div className="kpi-content">
            <span className="kpi-value">{formatMoney(analytics.totalSalary)}</span>
            <span className="kpi-label">ФОТ / мес</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon"><TrendingUp size={24} /></div>
          <div className="kpi-content">
            <span className="kpi-value">{formatMoney(analytics.avgSalary)}</span>
            <span className="kpi-label">Средняя ЗП</span>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon"><Clock size={24} /></div>
          <div className="kpi-content">
            <span className="kpi-value">{analytics.avgTenure.toFixed(1)} лет</span>
            <span className="kpi-label">Средний стаж</span>
          </div>
        </div>
      </div>

      {/* Текучесть */}
      <div className="analytics-turnover">
        <div className="turnover-item positive">
          <UserPlus size={18} />
          <span>+{analytics.hiredThisYear} принято за год</span>
        </div>
        <div className="turnover-item negative">
          <Users size={18} />
          <span>-{analytics.archivedThisYear} уволено за год</span>
        </div>
        <div className={`turnover-item ${analytics.fotGrowth >= 0 ? 'positive' : 'negative'}`}>
          <TrendingUp size={18} />
          <span>{analytics.fotGrowth >= 0 ? '+' : ''}{analytics.fotGrowth.toFixed(1)}% ФОТ за год</span>
        </div>
      </div>

      <div className="analytics-grid">
        {/* Динамика ФОТ */}
        <div className="analytics-card wide">
          <h3>Динамика ФОТ</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={analytics.fotHistory}>
                <defs>
                  <linearGradient id="fotGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#C4A77D" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#C4A77D" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} tickFormatter={v => `${(v/1000000).toFixed(1)}М`} />
                <Tooltip
                  formatter={(value) => [formatMoney(Number(value)) + ' ₽', 'ФОТ']}
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
                <Area type="monotone" dataKey="fot" stroke="#C4A77D" fill="url(#fotGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Распределение по группам */}
        <div className="analytics-card">
          <h3>По группам</h3>
          <div className="chart-container pie-container">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={analytics.groupData}
                  cx="50%"
                  cy="40%"
                  innerRadius={35}
                  outerRadius={60}
                  dataKey="value"
                >
                  {analytics.groupData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, _, props) => [
                    `${value} чел. (${formatMoney(props.payload.salary)} ₽)`,
                    props.payload.name
                  ]}
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  formatter={(value, entry) => {
                    const item = analytics.groupData.find(g => g.name === value)
                    return `${value}: ${item?.value || 0}`
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Распределение по стажу */}
        <div className="analytics-card">
          <h3>По стажу</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={analytics.tenureBuckets} layout="vertical">
                <XAxis type="number" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <YAxis dataKey="label" type="category" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} width={70} />
                <Tooltip
                  formatter={(value) => [`${value} чел.`, 'Сотрудников']}
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
                <Bar dataKey="count" fill="#6B99CC" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Топ зарплат */}
        <div className="analytics-card">
          <h3><Award size={16} /> Топ-5 по зарплате</h3>
          <div className="top-list">
            {analytics.topSalaries.map((emp, i) => (
              <div key={emp.id} className="top-item">
                <span className="top-rank">{i + 1}</span>
                <div className="top-info">
                  <span className="top-name">{emp.full_name}</span>
                  <span className="top-position">{emp.position}</span>
                </div>
                <span className="top-salary">{formatMoney(emp.current_salary)} ₽</span>
              </div>
            ))}
          </div>
        </div>

        {/* Ближайшие ДР */}
        <div className="analytics-card">
          <h3><Calendar size={16} /> Дни рождения (30 дней)</h3>
          <div className="events-list">
            {analytics.upcomingBirthdays.length === 0 ? (
              <div className="no-events">Нет ближайших дней рождения</div>
            ) : (
              analytics.upcomingBirthdays.map(emp => (
                <div key={emp.id} className="event-item">
                  <div className="event-date">
                    {emp.daysUntil === 0 ? 'Сегодня!' :
                     emp.daysUntil === 1 ? 'Завтра' :
                     `Через ${emp.daysUntil} дн.`}
                  </div>
                  <div className="event-info">
                    <span className="event-name">{emp.full_name}</span>
                    <span className="event-detail">
                      {emp.nextBirthday.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Новые сотрудники */}
        <div className="analytics-card">
          <h3><UserPlus size={16} /> Новые (90 дней)</h3>
          <div className="events-list">
            {analytics.newHires.length === 0 ? (
              <div className="no-events">Нет новых сотрудников</div>
            ) : (
              analytics.newHires.map(emp => (
                <div key={emp.id} className="event-item">
                  <div className="event-date">
                    {new Date(emp.hire_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                  </div>
                  <div className="event-info">
                    <span className="event-name">{emp.full_name}</span>
                    <span className="event-detail">{emp.position}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
