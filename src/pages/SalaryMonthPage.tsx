import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './SalaryMonthPage.css'

interface Payment {
  id: string
  amount: number
  date: string
  note: string
}

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

const WORK_DAYS_BY_MONTH: { [year: number]: number[] } = {
  2024: [17, 20, 20, 22, 18, 19, 23, 22, 21, 23, 20, 22],
  2025: [17, 20, 21, 22, 18, 19, 23, 21, 22, 23, 19, 22],
  2026: [15, 19, 21, 22, 19, 21, 23, 21, 22, 22, 20, 22],
}

function getWorkDaysInMonth(year: number, month: number): number {
  return WORK_DAYS_BY_MONTH[year]?.[month] ?? 22
}

export default function SalaryMonthPage() {
  const { year: yearParam, month: monthParam } = useParams()
  const navigate = useNavigate()
  const year = Number(yearParam)
  const month = Number(monthParam)

  const [userId, setUserId] = useState<string | null>(null)
  const [salary, setSalary] = useState(100000)
  const [payments, setPayments] = useState<Payment[]>([])
  const [stats, setStats] = useState({ work: 0, worked: 0, vacation: 0 })
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [newPaymentAmount, setNewPaymentAmount] = useState('')
  const [newPaymentNote, setNewPaymentNote] = useState('')

  const legalDays = getWorkDaysInMonth(year, month)
  const dailyRate = salary / legalDays
  const workPayment = dailyRate * stats.work
  const weekendPayment = dailyRate * stats.worked
  const totalEarned = workPayment + weekendPayment
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
  const remaining = totalEarned - totalPaid

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
        loadData(user.id)
      }
    })
  }, [year, month])

  const loadData = async (uid: string) => {
    // Load salary
    const { data: salaryData } = await supabase
      .from('salary_settings')
      .select('base_salary')
      .eq('user_id', uid)
      .eq('year', year)
      .eq('month', month)
      .single()

    if (salaryData) {
      setSalary(Number(salaryData.base_salary))
    }

    // Load payments
    const { data: paymentsData } = await supabase
      .from('salary_payments')
      .select('id, amount, date, note')
      .eq('user_id', uid)
      .eq('year', year)
      .eq('month', month)
      .order('date', { ascending: false })

    if (paymentsData) {
      setPayments(paymentsData.map(p => ({
        id: p.id,
        amount: Number(p.amount),
        date: p.date,
        note: p.note || ''
      })))
    }

    // Load stats from calendar_days
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
    const { data: daysData } = await supabase
      .from('calendar_days')
      .select('status')
      .like('date', `${prefix}%`)

    if (daysData) {
      const counts = daysData.reduce(
        (acc, row) => {
          if (row.status === 'work') acc.work++
          if (row.status === 'worked') acc.worked++
          if (row.status === 'vacation') acc.vacation++
          return acc
        },
        { work: 0, worked: 0, vacation: 0 }
      )
      setStats(counts)
    }
  }

  const saveSalary = async (value: number) => {
    setSalary(value)
    if (!userId) return

    await supabase.from('salary_settings').upsert(
      { user_id: userId, year, month, base_salary: value },
      { onConflict: 'user_id,year,month' }
    )
  }

  const addPayment = async () => {
    if (!userId || !newPaymentAmount) return

    const amount = Number(newPaymentAmount.replace(/\D/g, ''))
    if (amount <= 0) return

    const { data, error } = await supabase
      .from('salary_payments')
      .insert({
        user_id: userId,
        year,
        month,
        amount,
        date: new Date().toISOString().split('T')[0],
        note: newPaymentNote
      })
      .select()
      .single()

    if (!error && data) {
      setPayments(prev => [{
        id: data.id,
        amount: Number(data.amount),
        date: data.date,
        note: data.note || ''
      }, ...prev])
    }

    setNewPaymentAmount('')
    setNewPaymentNote('')
    setShowAddPayment(false)
  }

  const deletePayment = async (id: string) => {
    await supabase.from('salary_payments').delete().eq('id', id)
    setPayments(prev => prev.filter(p => p.id !== id))
  }

  return (
    <div className="salary-month-page">
      <div className="month-page-header">
        <button className="back-btn" onClick={() => navigate('/salary')}>
          <ArrowLeft size={20} />
          <span>Назад</span>
        </button>
        <h1>{MONTHS[month]} {year}</h1>
      </div>

      <div className="month-section">
        <div className="section-title">Настройки</div>
        <div className="settings-row">
          <span>Оклад</span>
          <div className="inline-input">
            <input
              type="text"
              inputMode="numeric"
              value={salary.toLocaleString('ru-RU')}
              onChange={e => saveSalary(Number(e.target.value.replace(/\D/g, '')))}
            />
            <span>₽</span>
          </div>
        </div>
        <div className="settings-row">
          <span>Рабочих дней (норма)</span>
          <span className="settings-value">{legalDays}</span>
        </div>
        <div className="settings-row">
          <span>Ставка за день</span>
          <span className="settings-value">{Math.round(dailyRate).toLocaleString('ru-RU')} ₽</span>
        </div>
      </div>

      <div className="month-section">
        <div className="section-title">Отработано</div>
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-label">Рабочие</span>
            <span className="stat-value">{stats.work}</span>
          </div>
          <div className="stat-item worked">
            <span className="stat-label">Выходные</span>
            <span className="stat-value">{stats.worked}</span>
          </div>
          <div className="stat-item vacation">
            <span className="stat-label">Отпуск</span>
            <span className="stat-value">{stats.vacation}</span>
          </div>
        </div>
      </div>

      <div className="month-section">
        <div className="section-title">Расчёт</div>
        <div className="calc-grid">
          <div className="calc-item">
            <span>За рабочие дни ({stats.work})</span>
            <span>{Math.round(workPayment).toLocaleString('ru-RU')} ₽</span>
          </div>
          <div className="calc-item">
            <span>За выходные ({stats.worked})</span>
            <span>{Math.round(weekendPayment).toLocaleString('ru-RU')} ₽</span>
          </div>
          <div className="calc-item total">
            <span>Начислено</span>
            <span>{Math.round(totalEarned).toLocaleString('ru-RU')} ₽</span>
          </div>
        </div>
      </div>

      <div className="month-section">
        <div className="section-header">
          <div className="section-title">Выплаты</div>
          <button className="add-payment-btn" onClick={() => setShowAddPayment(true)}>
            <Plus size={18} />
          </button>
        </div>

        {showAddPayment && (
          <div className="add-payment-form">
            <div className="form-row">
              <input
                type="text"
                inputMode="numeric"
                placeholder="Сумма"
                value={newPaymentAmount}
                onChange={e => setNewPaymentAmount(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
              <span>₽</span>
            </div>
            <input
              type="text"
              placeholder="Комментарий (опционально)"
              value={newPaymentNote}
              onChange={e => setNewPaymentNote(e.target.value)}
            />
            <div className="form-actions">
              <button className="btn-cancel" onClick={() => setShowAddPayment(false)}>Отмена</button>
              <button className="btn-add" onClick={addPayment}>Добавить</button>
            </div>
          </div>
        )}

        {payments.length > 0 ? (
          <div className="payments-list">
            {payments.map(p => (
              <div key={p.id} className="payment-item">
                <div className="payment-info">
                  <span className="payment-amount">{p.amount.toLocaleString('ru-RU')} ₽</span>
                  <span className="payment-date">{new Date(p.date).toLocaleDateString('ru-RU')}</span>
                  {p.note && <span className="payment-note">{p.note}</span>}
                </div>
                <button className="delete-btn" onClick={() => deletePayment(p.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="no-payments">Нет выплат</div>
        )}

        <div className="payments-summary">
          <div className="summary-row">
            <span>Выплачено</span>
            <span className="paid">{Math.round(totalPaid).toLocaleString('ru-RU')} ₽</span>
          </div>
          <div className="summary-row total">
            <span>Остаток</span>
            <span className={remaining <= 0 ? 'paid-full' : ''}>{Math.round(remaining).toLocaleString('ru-RU')} ₽</span>
          </div>
        </div>
      </div>
    </div>
  )
}
