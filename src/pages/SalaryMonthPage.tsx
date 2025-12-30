import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getWorkDaysNorm as getDefaultWorkDaysNorm } from '../lib/workNorms'
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

export default function SalaryMonthPage() {
  const { year: yearParam, month: monthParam } = useParams()
  const navigate = useNavigate()
  const year = Number(yearParam)
  const month = Number(monthParam)

  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [salary, setSalary] = useState(100000)
  const [salaryInput, setSalaryInput] = useState('100 000')
  const [bonus, setBonus] = useState(0)
  const [bonusInput, setBonusInput] = useState('')
  const [transportBaseCost, setTransportBaseCost] = useState(0)
  const [transportInput, setTransportInput] = useState('')
  const [legalDays, setLegalDays] = useState(22)
  const [legalDaysInput, setLegalDaysInput] = useState('22')
  const [vacationRate, setVacationRate] = useState(0)
  const [payments, setPayments] = useState<Payment[]>([])
  const [stats, setStats] = useState({ work: 0, worked: 0, vacation: 0 })
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [newPaymentAmount, setNewPaymentAmount] = useState('')
  const [newPaymentNote, setNewPaymentNote] = useState('')
  const dailyRate = salary / legalDays
  const workPayment = dailyRate * stats.work
  const weekendPayment = dailyRate * stats.worked

  const transportDailyRate = transportBaseCost / legalDays
  const transportPayment = transportDailyRate * stats.work

  const vacationPayment = stats.vacation * vacationRate
  const totalEarned = workPayment + weekendPayment + bonus + transportPayment + vacationPayment
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

  const isManualMonth = year < 2025 || (year === 2025 && month <= 2)

  const loadData = async (uid: string) => {
    setLoading(true)

    const [salaryResult, vacResult, paymentsResult, calcResult] = await Promise.all([
      supabase
        .from('salary_settings')
        .select('base_salary, bonus, transport_base_cost, work_days_norm, manual_vacation_rate')
        .eq('user_id', uid)
        .eq('year', year)
        .eq('month', month)
        .single(),
      !isManualMonth
        ? supabase
            .from('vacation_rate')
            .select('daily_vacation_rate')
            .eq('user_id', uid)
            .eq('year', year)
            .eq('month', month)
            .single()
        : Promise.resolve({ data: null }),
      supabase
        .from('salary_payments')
        .select('id, amount, date, note')
        .eq('user_id', uid)
        .eq('year', year)
        .eq('month', month)
        .order('date', { ascending: false }),
      supabase
        .from('salary_calculations')
        .select('work_days, worked_days, vacation_days')
        .eq('user_id', uid)
        .eq('year', year)
        .eq('month', month)
        .single()
    ])

    if (salaryResult.data) {
      const sal = Number(salaryResult.data.base_salary)
      const bon = Number(salaryResult.data.bonus) || 0
      const trans = Number(salaryResult.data.transport_base_cost) || 0
      const norm = Number(salaryResult.data.work_days_norm) || getDefaultWorkDaysNorm(year, month)
      setSalary(sal)
      setSalaryInput(sal.toLocaleString('ru-RU'))
      setBonus(bon)
      setBonusInput(bon > 0 ? bon.toLocaleString('ru-RU') : '')
      setTransportBaseCost(trans)
      setTransportInput(trans > 0 ? trans.toLocaleString('ru-RU') : '')
      setLegalDays(norm)
      setLegalDaysInput(String(norm))

      if (isManualMonth && salaryResult.data.manual_vacation_rate) {
        setVacationRate(Number(salaryResult.data.manual_vacation_rate))
      }
    }

    if (vacResult.data) {
      setVacationRate(Number(vacResult.data.daily_vacation_rate) || 0)
    }

    if (paymentsResult.data) {
      setPayments(paymentsResult.data.map(p => ({
        id: p.id,
        amount: Number(p.amount),
        date: p.date,
        note: p.note || ''
      })))
    }

    if (calcResult.data) {
      setStats({
        work: calcResult.data.work_days || 0,
        worked: calcResult.data.worked_days || 0,
        vacation: calcResult.data.vacation_days || 0
      })
    }
    setLoading(false)
  }

  const saveSettings = async (field: string, value: number) => {
    if (!userId) return
    await supabase.from('salary_settings').upsert(
      { user_id: userId, year, month, [field]: value },
      { onConflict: 'user_id,year,month' }
    )
  }

  const parseNumber = (value: string): number => {
    const cleaned = value.replace(/\s/g, '').replace(',', '.')
    return parseFloat(cleaned) || 0
  }

  const handleSalaryBlur = () => {
    const value = parseNumber(salaryInput) || 0
    setSalary(value)
    setSalaryInput(Math.round(value).toLocaleString('ru-RU'))
    saveSettings('base_salary', value)
  }

  const handleBonusBlur = () => {
    const value = parseNumber(bonusInput) || 0
    setBonus(value)
    setBonusInput(value > 0 ? Math.round(value).toLocaleString('ru-RU') : '')
    saveSettings('bonus', value)
  }

  const handleTransportBlur = () => {
    const value = parseNumber(transportInput) || 0
    setTransportBaseCost(value)
    setTransportInput(value > 0 ? Math.round(value).toLocaleString('ru-RU') : '')
    saveSettings('transport_base_cost', value)
  }

  const handleLegalDaysBlur = () => {
    const value = Math.round(parseNumber(legalDaysInput)) || getDefaultWorkDaysNorm(year, month)
    setLegalDays(value)
    setLegalDaysInput(String(value))
    saveSettings('work_days_norm', value)
  }

  const addPayment = async () => {
    if (!userId || !newPaymentAmount) return

    const amount = parseNumber(newPaymentAmount)
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

  if (loading) {
    return (
      <div className="salary-month-page">
        <div className="month-page-header">
          <button className="back-btn" onClick={() => navigate('/salary', { state: { year } })}>
            <ArrowLeft size={20} />
            <span>Назад</span>
          </button>
          <h1>{MONTHS[month]} {year}</h1>
        </div>
        <div className="loading">Загрузка...</div>
      </div>
    )
  }

  return (
    <div className="salary-month-page">
      <div className="month-page-header">
        <button className="back-btn" onClick={() => navigate('/salary', { state: { year } })}>
          <ArrowLeft size={20} />
          <span>Назад</span>
        </button>
        <h1>{MONTHS[month]} {year}</h1>
      </div>

      <div className="month-content">
        <div className="content-left">
          <div className="month-section">
            <div className="section-title">Настройки</div>
            <div className="settings-row">
              <span>Оклад</span>
              <div className="inline-input">
                <input
                  type="text"
                  inputMode="numeric"
                  value={salaryInput}
                  onChange={e => setSalaryInput(e.target.value)}
                  onBlur={handleSalaryBlur}
                />
                <span>₽</span>
              </div>
            </div>
            <div className="settings-row">
              <span>Премия</span>
              <div className="inline-input">
                <input
                  type="text"
                  inputMode="numeric"
                  value={bonusInput}
                  placeholder="0"
                  onChange={e => setBonusInput(e.target.value)}
                  onBlur={handleBonusBlur}
                />
                <span>₽</span>
              </div>
            </div>
            <div className="settings-row">
              <span>Рабочих дней (норма)</span>
              <div className="inline-input small">
                <input
                  type="text"
                  inputMode="numeric"
                  value={legalDaysInput}
                  onChange={e => setLegalDaysInput(e.target.value)}
                  onBlur={handleLegalDaysBlur}
                />
              </div>
            </div>
            <div className="settings-row">
              <span>Ставка за день</span>
              <span className="settings-value">{Math.round(dailyRate).toLocaleString('ru-RU')} ₽</span>
            </div>
          </div>

          <div className="month-section">
            <div className="section-title">Проезд</div>
            <div className="settings-row">
              <span>Базовая стоимость</span>
              <div className="inline-input">
                <input
                  type="text"
                  inputMode="numeric"
                  value={transportInput}
                  placeholder="0"
                  onChange={e => setTransportInput(e.target.value)}
                  onBlur={handleTransportBlur}
                />
                <span>₽</span>
              </div>
            </div>
            <div className="settings-row">
              <span>Ставка за день</span>
              <span className="settings-value">{Math.round(transportDailyRate).toLocaleString('ru-RU')} ₽</span>
            </div>
            <div className="settings-row">
              <span>К оплате ({stats.work} дн.)</span>
              <span className="settings-value">{Math.round(transportPayment).toLocaleString('ru-RU')} ₽</span>
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
              {bonus > 0 && (
                <div className="calc-item">
                  <span>Премия</span>
                  <span>{Math.round(bonus).toLocaleString('ru-RU')} ₽</span>
                </div>
              )}
              {transportPayment > 0 && (
                <div className="calc-item">
                  <span>Проезд</span>
                  <span>{Math.round(transportPayment).toLocaleString('ru-RU')} ₽</span>
                </div>
              )}
              {vacationPayment > 0 && (
                <div className="calc-item">
                  <span>Отпускные ({stats.vacation} × {Math.round(vacationRate).toLocaleString('ru-RU')})</span>
                  <span>{Math.round(vacationPayment).toLocaleString('ru-RU')} ₽</span>
                </div>
              )}
              <div className="calc-item total">
                <span>Начислено</span>
                <span>{Math.round(totalEarned).toLocaleString('ru-RU')} ₽</span>
              </div>
            </div>
          </div>
        </div>

        <div className="content-right">
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
                    onChange={e => setNewPaymentAmount(e.target.value)}
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
      </div>
    </div>
  )
}
