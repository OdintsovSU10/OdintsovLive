import { useState, useEffect } from 'react'
import { Shield, ChevronLeft, ChevronRight, Upload, Table, LayoutList, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Employee, SKUDDailySummary, SKUDParseResult, SKUDImportRow, SKUDEvent } from './types'
import * as XLSX from 'xlsx'
import './SKUDPage.css'

export default function SKUDPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [currentDate, setCurrentDate] = useState(new Date())
  const [summaries, setSummaries] = useState<{ [employeeId: number]: SKUDDailySummary[] }>({})
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importPreview, setImportPreview] = useState<{ full_name: string; events: SKUDImportRow[] }[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [notFoundEmployees, setNotFoundEmployees] = useState<string[]>([])
  const [showNotFoundModal, setShowNotFoundModal] = useState(false)
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'table' | 'cards'>('table')
  const [expandedEmployees, setExpandedEmployees] = useState<Set<number>>(new Set())
  const [employeeEvents, setEmployeeEvents] = useState<{ [employeeId: number]: SKUDEvent[] }>({})
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [clearing, setClearing] = useState(false)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const daysInMonth = new Date(year, month, 0).getDate()

  useEffect(() => {
    loadEmployees()
  }, [])

  useEffect(() => {
    if (employees.length > 0) {
      loadSummaries()
      setEmployeeEvents({}) // Clear events when month changes
      setExpandedEmployees(new Set()) // Collapse all cards
    }
  }, [currentDate, employees])

  const loadEmployees = async () => {
    const { data } = await supabase
      .from('tender_employees')
      .select('id, full_name, position, group_name')
      .eq('is_archived', false)
      .order('full_name')

    if (data) setEmployees(data)
    setLoading(false)
  }

  const loadSummaries = async () => {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

    const { data } = await supabase
      .from('skud_daily_summary')
      .select('*')
      .gte('work_date', startDate)
      .lte('work_date', endDate)

    if (data) {
      const grouped = data.reduce((acc, summary) => {
        if (!acc[summary.employee_id]) acc[summary.employee_id] = []
        acc[summary.employee_id].push(summary)
        return acc
      }, {} as { [key: number]: SKUDDailySummary[] })

      setSummaries(grouped)
    }
  }

  const parseExcel = async (file: File): Promise<SKUDParseResult> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: 'array' })
          const sheet = workbook.Sheets[workbook.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 })

          // Пропускаем заголовок
          const dataRows = rows.slice(1).filter(row => row.length >= 10)

          // Для отладки: выведем первую строку данных
          if (dataRows.length > 0) {
            console.log('Первая строка данных:', dataRows[0])
            console.log('Столбец 4 (Период):', dataRows[0][4])
          }

          const eventsByEmployee: { [key: string]: SKUDImportRow[] } = {}

          dataRows.forEach(row => {
            const employeeName = String(row[0] || '').trim()
            if (!employeeName) return

            const doorValue = String(row[8] || '')
            const isEntry = doorValue.includes('1')

            // Извлекаем время из столбца "Период" (может быть "дата время" или просто "время")
            const periodValue = String(row[4] || '')
            let timeValue = periodValue

            // Если формат "26.01.2026 09:15:00" — берём только время
            const timeMatch = periodValue.match(/(\d{1,2}:\d{2}(:\d{2})?)/)
            if (timeMatch) {
              timeValue = timeMatch[1]
            }

            // Убедимся что время в формате HH:MM:SS
            if (timeValue && !timeValue.includes(':')) {
              timeValue = '00:00:00'
            } else if (timeValue.split(':').length === 2) {
              timeValue = timeValue + ':00'
            }

            const event: SKUDImportRow & { isEntry: boolean } = {
              employee_name: employeeName,
              physical_person: String(row[1] || ''),
              department: String(row[2] || ''),
              date: String(row[3] || ''),
              time: timeValue,
              location: String(row[5] || ''),
              card: String(row[6] || ''),
              controller: String(row[7] || ''),
              door: doorValue,
              manual_entry: String(row[9] || '').toLowerCase() === 'да',
              isEntry
            }

            if (!eventsByEmployee[employeeName]) {
              eventsByEmployee[employeeName] = []
            }
            eventsByEmployee[employeeName].push(event)
          })

          const found: { full_name: string; events: SKUDImportRow[] }[] = []
          const notFound: string[] = []

          Object.keys(eventsByEmployee).forEach(name => {
            const employee = employees.find(e =>
              e.full_name.toLowerCase().trim() === name.toLowerCase().trim()
            )

            if (employee) {
              found.push({
                full_name: employee.full_name,
                events: eventsByEmployee[name]
              })
            } else {
              notFound.push(name)
            }
          })

          resolve({ found, notFound })
        } catch (error) {
          console.error('Ошибка парсинга:', error)
          resolve({ found: [], notFound: [] })
        }
      }
      reader.readAsArrayBuffer(file)
    })
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const result = await parseExcel(file)

      if (result.found.length === 0 && result.notFound.length === 0) {
        alert('Файл пуст или не удалось распознать данные')
        return
      }

      if (result.notFound.length > 0) {
        setNotFoundEmployees(result.notFound)
        setSelectedToAdd(new Set(result.notFound))
        setImportPreview(result.found)
        setShowNotFoundModal(true)
      } else {
        setImportPreview(result.found)
        setShowPreview(true)
      }
    } catch (error) {
      console.error('Ошибка импорта:', error)
      alert('Ошибка при чтении файла')
    } finally {
      e.target.value = ''
    }
  }

  const handleConfirmImport = async () => {
    setImporting(true)
    try {
      // Собираем все данные для batch insert
      const allEvents: any[] = []
      const allSummaries: any[] = []

      for (const item of importPreview) {
        const employee = employees.find(e => e.full_name === item.full_name)
        if (!employee) continue

        // Группируем события по дням
        const eventsByDate: { [date: string]: any[] } = {}

        item.events.forEach(event => {
          const dateMatch = event.date.match(/(\d{2})\.(\d{2})\.(\d{4})/)
          if (!dateMatch) return

          const [, day, mon, yr] = dateMatch
          const normalizedDate = `${yr}-${mon}-${day}`

          if (!eventsByDate[normalizedDate]) {
            eventsByDate[normalizedDate] = []
          }
          eventsByDate[normalizedDate].push(event)
        })

        // Обрабатываем каждый день
        for (const [date, dayEvents] of Object.entries(eventsByDate)) {
          const sortedEvents = dayEvents.sort((a, b) => {
            const timeA = (a.time || '00:00').split(':').map(Number)
            const timeB = (b.time || '00:00').split(':').map(Number)
            return (timeA[0] * 60 + (timeA[1] || 0)) - (timeB[0] * 60 + (timeB[1] || 0))
          })

          const entries = sortedEvents.filter((e: any) => e.isEntry)
          const exits = sortedEvents.filter((e: any) => !e.isEntry)

          const firstEntry = entries[0]?.time || sortedEvents[0]?.time
          const lastExit = exits[exits.length - 1]?.time || sortedEvents[sortedEvents.length - 1]?.time
          const totalHours = calculateOfficeHours(sortedEvents)

          // Добавляем события в массив
          for (const event of sortedEvents) {
            const eventTime = event.time && /^\d{1,2}:\d{2}(:\d{2})?$/.test(event.time)
              ? event.time : '00:00:00'

            allEvents.push({
              employee_id: employee.id,
              event_date: date,
              event_time: eventTime,
              event_datetime: `${date}T${eventTime}`,
              event_type: event.isEntry ? 'entry' : 'exit',
              physical_person: event.physical_person || null,
              department: event.department || null,
              location: event.location || null,
              card_number: event.card || null,
              controller: event.controller || null,
              door: event.door || null,
              manual_entry: event.manual_entry || false
            })
          }

          // Добавляем сводку
          allSummaries.push({
            employee_id: employee.id,
            work_date: date,
            first_entry: firstEntry || null,
            last_exit: lastExit || null,
            total_office_hours: totalHours || 0,
            entries_count: entries.length,
            exits_count: exits.length,
            status: 'present',
            updated_at: new Date().toISOString()
          })
        }
      }

      // Batch insert событий (по 500 за раз)
      const BATCH_SIZE = 500
      for (let i = 0; i < allEvents.length; i += BATCH_SIZE) {
        const batch = allEvents.slice(i, i + BATCH_SIZE)
        const { error } = await supabase.from('skud_events').insert(batch)
        if (error) console.error('Batch insert error:', error)
      }

      // Batch upsert сводок
      for (let i = 0; i < allSummaries.length; i += BATCH_SIZE) {
        const batch = allSummaries.slice(i, i + BATCH_SIZE)
        const { error } = await supabase.from('skud_daily_summary')
          .upsert(batch, { onConflict: 'employee_id,work_date' })
        if (error) console.error('Batch upsert error:', error)
      }

      console.log(`Импортировано: ${allEvents.length} событий, ${allSummaries.length} сводок`)

      await loadSummaries()
      setShowPreview(false)
      setImportPreview([])
    } catch (error) {
      console.error('Ошибка импорта:', error)
      alert('Ошибка при импорте данных')
    } finally {
      setImporting(false)
    }
  }

  const calculateOfficeHours = (events: any[]): number => {
    if (events.length === 0) return 0

    // Разделяем на входы и выходы
    const entries = events.filter(e => e.isEntry).map(e => {
      const [h, m] = e.time.split(':').map(Number)
      return { time: h * 60 + m, type: 'entry' }
    })

    const exits = events.filter(e => !e.isEntry).map(e => {
      const [h, m] = e.time.split(':').map(Number)
      return { time: h * 60 + m, type: 'exit' }
    })

    if (entries.length === 0) return 0

    // Считаем время по парам вход-выход
    let totalMinutes = 0
    let entryIndex = 0
    let exitIndex = 0

    while (entryIndex < entries.length) {
      const entry = entries[entryIndex]

      // Ищем ближайший выход после входа
      while (exitIndex < exits.length && exits[exitIndex].time < entry.time) {
        exitIndex++
      }

      if (exitIndex < exits.length) {
        // Нашли пару вход-выход
        totalMinutes += exits[exitIndex].time - entry.time
        exitIndex++
      } else {
        // Нет выхода - считаем до конца дня (23:59)
        totalMinutes += (23 * 60 + 59) - entry.time
      }

      entryIndex++
    }

    return totalMinutes / 60
  }

  const handleConfirmNotFound = async () => {
    try {
      setImporting(true)

      if (selectedToAdd.size > 0) {
        const namesToAdd = Array.from(selectedToAdd)
        for (const name of namesToAdd) {
          await supabase.from('tender_employees').insert({
            full_name: name,
            position: 'Не указано',
            hire_date: new Date().toISOString().split('T')[0],
            current_salary: 0
          })
        }
        await loadEmployees()
      }

      setShowNotFoundModal(false)
      setNotFoundEmployees([])
      setSelectedToAdd(new Set())

      if (importPreview.length > 0) {
        setShowPreview(true)
      }
    } catch (error) {
      console.error('Ошибка добавления сотрудников:', error)
      alert('Ошибка при добавлении сотрудников')
    } finally {
      setImporting(false)
    }
  }

  const toggleEmployeeSelection = (name: string) => {
    setSelectedToAdd(prev => {
      const newSet = new Set(prev)
      if (newSet.has(name)) {
        newSet.delete(name)
      } else {
        newSet.add(name)
      }
      return newSet
    })
  }

  const toggleSelectAll = () => {
    if (selectedToAdd.size === notFoundEmployees.length) {
      setSelectedToAdd(new Set())
    } else {
      setSelectedToAdd(new Set(notFoundEmployees))
    }
  }

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(year, month, 1))
  }

  const formatHours = (hours: number | null) => {
    if (!hours) return '—'
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    return `${h}:${String(m).padStart(2, '0')}`
  }

  const getDaySummary = (employeeId: number, day: number) => {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return summaries[employeeId]?.find(s => s.work_date === date)
  }

  const getEmployeeStats = (employeeId: number) => {
    const entries = summaries[employeeId] || []
    const totalDays = entries.length
    const totalHours = entries.reduce((sum, e) => sum + (e.total_office_hours || 0), 0)
    const avgHours = totalDays > 0 ? totalHours / totalDays : 0

    return { totalDays, totalHours, avgHours }
  }

  const loadEmployeeEvents = async (employeeId: number) => {
    if (employeeEvents[employeeId]) return // already loaded

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

    const { data } = await supabase
      .from('skud_events')
      .select('*')
      .eq('employee_id', employeeId)
      .gte('event_date', startDate)
      .lte('event_date', endDate)
      .order('event_datetime', { ascending: true })

    if (data) {
      setEmployeeEvents(prev => ({ ...prev, [employeeId]: data }))
    }
  }

  const toggleEmployeeExpand = async (id: number) => {
    const isCurrentlyExpanded = expandedEmployees.has(id)

    if (isCurrentlyExpanded) {
      setExpandedEmployees(new Set())
    } else {
      setExpandedEmployees(new Set([id]))
      await loadEmployeeEvents(id)
    }
  }

  const getEventsByDate = (employeeId: number) => {
    const events = employeeEvents[employeeId] || []
    const grouped: { [date: string]: SKUDEvent[] } = {}

    events.forEach(event => {
      if (!grouped[event.event_date]) {
        grouped[event.event_date] = []
      }
      grouped[event.event_date].push(event)
    })

    return Object.entries(grouped).sort(([a], [b]) =>
      new Date(a).getTime() - new Date(b).getTime()
    )
  }

  const handleClearData = async () => {
    setClearing(true)
    try {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

      // Delete events for this month
      const { error: eventsError } = await supabase
        .from('skud_events')
        .delete()
        .gte('event_date', startDate)
        .lte('event_date', endDate)

      if (eventsError) console.error('Error deleting events:', eventsError)

      // Delete summaries for this month
      const { error: summariesError } = await supabase
        .from('skud_daily_summary')
        .delete()
        .gte('work_date', startDate)
        .lte('work_date', endDate)

      if (summariesError) console.error('Error deleting summaries:', summariesError)

      // Reload data
      setSummaries({})
      setEmployeeEvents({})
      await loadSummaries()
      setShowClearConfirm(false)
    } catch (error) {
      console.error('Error clearing data:', error)
      alert('Ошибка при очистке данных')
    } finally {
      setClearing(false)
    }
  }

  if (loading) {
    return <div className="loading-spinner" />
  }

  return (
    <div className="skud-page">
      <div className="skud-header">
        <div className="skud-title">
          <Shield size={24} />
          <h1>СКУД</h1>
        </div>
        <div className="skud-controls">
          <button onClick={prevMonth} className="btn-month-nav">
            <ChevronLeft size={18} />
          </button>
          <h2>{new Date(year, month - 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</h2>
          <button onClick={nextMonth} className="btn-month-nav">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="skud-actions">
          <label className="btn-import">
            <Upload size={18} />
            <span>Загрузить данные</span>
            <input type="file" accept=".xlsx,.xls" onChange={handleImport} hidden />
          </label>
        </div>
      </div>

      <div className="skud-tabs">
        <button
          className={`skud-tab ${activeTab === 'table' ? 'active' : ''}`}
          onClick={() => setActiveTab('table')}
        >
          <Table size={16} />
          <span>Таблица</span>
        </button>
        <button
          className={`skud-tab ${activeTab === 'cards' ? 'active' : ''}`}
          onClick={() => setActiveTab('cards')}
        >
          <LayoutList size={16} />
          <span>Карточки</span>
        </button>
      </div>

      {activeTab === 'table' && (
        <>
          <div className="skud-table-header">
            <div className="skud-legend">
              <span><strong>В ячейках:</strong></span>
              <span>верхняя — часы в офисе</span>
              <span>нижняя — время прихода</span>
            </div>
            <button className="btn-clear" onClick={() => setShowClearConfirm(true)}>
              <Trash2 size={14} />
              <span>Очистить месяц</span>
            </button>
          </div>

      <div className="skud-table-wrapper">
        <table className="skud-table">
          <thead>
            <tr>
              <th className="skud-name-col">ФИО</th>
              {Array.from({ length: daysInMonth }, (_, i) => (
                <th key={i + 1} className="skud-day-col">{i + 1}</th>
              ))}
              <th className="skud-stats-col">Статистика</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => {
              const stats = getEmployeeStats(emp.id)

              return (
                <tr key={emp.id}>
                  <td className="skud-name-cell">{emp.full_name}</td>
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1
                    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const dayOfWeek = new Date(date).getDay()
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
                    const summary = getDaySummary(emp.id, day)

                    let className = 'skud-cell'
                    if (isWeekend) className += ' skud-weekend'
                    if (summary) className += ' skud-present'

                    return (
                      <td key={day} className={className}>
                        {summary && (
                          <div className="skud-cell-content">
                            <span className="skud-hours">{formatHours(summary.total_office_hours)}</span>
                            {summary.first_entry && (
                              <span className="skud-time">{summary.first_entry.slice(0, 5)}</span>
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td className="skud-stats-cell">
                    {stats.totalDays > 0 ? (
                      <div className="skud-stats">
                        <span>Дней: {stats.totalDays}</span>
                        <span>Часов: {formatHours(stats.totalHours)}</span>
                        <span>Среднее: {formatHours(stats.avgHours)}</span>
                      </div>
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
          </div>
        </>
      )}

      {activeTab === 'cards' && (
        <div className="skud-cards-layout">
          <div className="skud-cards-list">
            {employees.map(emp => {
              const stats = getEmployeeStats(emp.id)
              const isSelected = expandedEmployees.has(emp.id)

              return (
                <div
                  key={emp.id}
                  className={`skud-card-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleEmployeeExpand(emp.id)}
                >
                  <div className="skud-card-info">
                    <span className="skud-card-name">{emp.full_name}</span>
                    {emp.position && <span className="skud-card-position">{emp.position}</span>}
                  </div>
                  <div className="skud-card-summary">
                    {stats.totalDays > 0 ? (
                      <>
                        <span className="skud-card-stat">{stats.totalDays} дн.</span>
                        <span className="skud-card-stat">{formatHours(stats.totalHours)} ч.</span>
                      </>
                    ) : (
                      <span className="skud-card-stat empty">—</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="skud-cards-detail">
            {Array.from(expandedEmployees).length === 0 ? (
              <div className="skud-detail-placeholder">
                Выберите сотрудника для просмотра событий
              </div>
            ) : (
              (() => {
                const selectedId = Array.from(expandedEmployees)[0]
                const emp = employees.find(e => e.id === selectedId)
                if (!emp) return null

                const stats = getEmployeeStats(emp.id)

                const firstDayOfMonth = new Date(year, month - 1, 1).getDay()
                const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1

                return (
                  <div className="skud-detail-content">
                    <div className="skud-detail-header">
                      <div>
                        <h3>{emp.full_name}</h3>
                        {emp.position && <span className="skud-detail-position">{emp.position}</span>}
                      </div>
                      <div className="skud-detail-stats">
                        <span>{stats.totalDays} дней</span>
                        <span>{formatHours(stats.totalHours)} часов</span>
                        <span>~{formatHours(stats.avgHours)}/день</span>
                      </div>
                    </div>

                    <div className="skud-mini-calendar">
                      <div className="skud-mini-weekdays">
                        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
                          <span key={d}>{d}</span>
                        ))}
                      </div>
                      <div className="skud-mini-days">
                        {Array.from({ length: startOffset }).map((_, i) => (
                          <span key={`empty-${i}`} className="skud-mini-day empty" />
                        ))}
                        {Array.from({ length: daysInMonth }, (_, i) => {
                          const day = i + 1
                          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                          const dayDate = new Date(dateStr)
                          const dayOfWeek = dayDate.getDay()
                          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
                          const hasData = summaries[emp.id]?.some(s => s.work_date === dateStr)
                          const hours = summaries[emp.id]?.find(s => s.work_date === dateStr)?.total_office_hours

                          let className = 'skud-mini-day'
                          if (isWeekend) className += ' weekend'
                          if (hasData) className += ' present'

                          return (
                            <span key={day} className={className} title={hasData ? `${formatHours(hours ?? null)} в офисе` : ''}>
                              {day}
                            </span>
                          )
                        })}
                      </div>
                    </div>

                    <div className="skud-detail-events">
                      <div className="skud-events-header">
                        <span>Время</span>
                        <span>Тип</span>
                        <span>Интервал</span>
                        <span>Место</span>
                      </div>
                      {!employeeEvents[emp.id] ? (
                        <div className="skud-card-loading">Загрузка...</div>
                      ) : getEventsByDate(emp.id).length === 0 ? (
                        <div className="skud-card-empty">Нет событий за этот месяц</div>
                      ) : (
                        getEventsByDate(emp.id).map(([dateStr, events]) => {
                          const date = new Date(dateStr)
                          const dayOfWeek = date.getDay()
                          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
                          const weekdayName = date.toLocaleDateString('ru-RU', { weekday: 'short' })

                          // Calculate actual office time from entry-exit pairs
                          let totalMinutesInOffice = 0
                          let isInOffice = false
                          let lastEntryMinutes = 0

                          // Sort events by time and process sequentially
                          const sortedEvents = [...events]
                            .filter(e => e.event_time)
                            .sort((a, b) => {
                              const aParts = (a.event_time || '00:00').split(':').map(Number)
                              const bParts = (b.event_time || '00:00').split(':').map(Number)
                              return (aParts[0] * 60 + (aParts[1] || 0)) - (bParts[0] * 60 + (bParts[1] || 0))
                            })

                          sortedEvents.forEach(event => {
                            if (!event.event_time) return
                            const parts = event.event_time.split(':').map(Number)
                            const minutes = (parts[0] || 0) * 60 + (parts[1] || 0)

                            if (event.event_type === 'entry' && !isInOffice) {
                              isInOffice = true
                              lastEntryMinutes = minutes
                            } else if (event.event_type === 'exit' && isInOffice) {
                              totalMinutesInOffice += minutes - lastEntryMinutes
                              isInOffice = false
                            }
                          })

                          const officeHours = Math.floor(totalMinutesInOffice / 60)
                          const officeMinutes = totalMinutesInOffice % 60
                          const officeTimeStr = totalMinutesInOffice > 0
                            ? `${officeHours}ч ${officeMinutes}м в офисе`
                            : ''

                          return (
                            <div key={dateStr} className={`skud-card-day-group ${isWeekend ? 'weekend' : ''}`}>
                              <div className="skud-card-day-header">
                                <span className="skud-card-date">
                                  {date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                                  <small>{weekdayName}</small>
                                </span>
                                {officeTimeStr && (
                                  <span className="skud-card-day-total">
                                    {officeTimeStr}
                                  </span>
                                )}
                              </div>
                              <div className="skud-card-events">
                                {events.map((event, idx) => {
                                  // Calculate duration for exit events
                                  let duration = ''
                                  if (event.event_type === 'exit' && idx > 0 && event.event_time) {
                                    // Find first entry after the last exit (or from start)
                                    const prevEvents = events.slice(0, idx)
                                    let lastExitIdx = -1
                                    for (let i = prevEvents.length - 1; i >= 0; i--) {
                                      if (prevEvents[i].event_type === 'exit') {
                                        lastExitIdx = i
                                        break
                                      }
                                    }
                                    // Find first entry after lastExitIdx
                                    const firstEntryAfterExit = prevEvents.slice(lastExitIdx + 1).find(e => e.event_type === 'entry' && e.event_time)

                                    if (firstEntryAfterExit && firstEntryAfterExit.event_time) {
                                      const entryParts = firstEntryAfterExit.event_time.split(':').map(Number)
                                      const exitParts = event.event_time.split(':').map(Number)
                                      const eh = entryParts[0] || 0
                                      const em = entryParts[1] || 0
                                      const xh = exitParts[0] || 0
                                      const xm = exitParts[1] || 0
                                      const diffMinutes = (xh * 60 + xm) - (eh * 60 + em)
                                      if (diffMinutes > 0) {
                                        const h = Math.floor(diffMinutes / 60)
                                        const m = diffMinutes % 60
                                        duration = h > 0 ? `${h}ч ${m}м` : `${m}м`
                                      }
                                    }
                                  }

                                  return (
                                    <div key={idx} className={`skud-card-event ${event.event_type}`}>
                                      <span className="skud-event-time">{(event.event_time || '—').slice(0, 5)}</span>
                                      <span className={`skud-event-type ${event.event_type}`}>
                                        {event.event_type === 'entry' ? 'Вход' : 'Выход'}
                                      </span>
                                      {duration && <span className="skud-event-duration">{duration}</span>}
                                      <span className="skud-event-location">{event.location || '—'}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })()
            )}
          </div>
        </div>
      )}

      {showNotFoundModal && (
        <div className="modal-overlay" onClick={() => !importing && setShowNotFoundModal(false)}>
          <div className="modal-content skud-notfound-modal" onClick={e => e.stopPropagation()}>
            <h3>Сотрудники не найдены</h3>
            <div className="notfound-content">
              <p>Найдено {notFoundEmployees.length} сотрудников, которых нет в базе. Выберите кого добавить:</p>
              <div className="notfound-select-all">
                <label>
                  <input
                    type="checkbox"
                    checked={selectedToAdd.size === notFoundEmployees.length}
                    onChange={toggleSelectAll}
                    disabled={importing}
                  />
                  <span>Выбрать всех</span>
                </label>
              </div>
              <div className="notfound-list">
                {notFoundEmployees.map((name, i) => (
                  <label key={i} className="notfound-item">
                    <input
                      type="checkbox"
                      checked={selectedToAdd.has(name)}
                      onChange={() => toggleEmployeeSelection(name)}
                      disabled={importing}
                    />
                    <span>{name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowNotFoundModal(false)} disabled={importing}>Отмена</button>
              <button onClick={handleConfirmNotFound} disabled={importing} className="btn-primary">
                {importing ? 'Добавление...' : `Добавить (${selectedToAdd.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPreview && (
        <div className="modal-overlay" onClick={() => setShowPreview(false)}>
          <div className="modal-content skud-preview-modal" onClick={e => e.stopPropagation()}>
            <h3>Предпросмотр импорта</h3>
            <div className="skud-preview">
              <p><strong>Сотрудников:</strong> {importPreview.length}</p>
              <p><strong>Событий:</strong> {importPreview.reduce((sum, item) => sum + item.events.length, 0)}</p>
              <ul>
                {importPreview.map((item, i) => (
                  <li key={i}><strong>{item.full_name}</strong> — {item.events.length} событий</li>
                ))}
              </ul>
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowPreview(false)} disabled={importing}>Отмена</button>
              <button onClick={handleConfirmImport} disabled={importing} className="btn-primary">
                {importing ? 'Импорт...' : 'Импортировать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {importing && (
        <div className="modal-overlay">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Импорт данных...</p>
          </div>
        </div>
      )}

      {showClearConfirm && (
        <div className="modal-overlay" onClick={() => !clearing && setShowClearConfirm(false)}>
          <div className="modal-content skud-clear-modal" onClick={e => e.stopPropagation()}>
            <h3>Очистить данные СКУД?</h3>
            <p>
              Будут удалены все события и сводки за{' '}
              <strong>{new Date(year, month - 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</strong>.
            </p>
            <p className="skud-clear-warning">Это действие необратимо.</p>
            <div className="modal-actions">
              <button onClick={() => setShowClearConfirm(false)} disabled={clearing}>Отмена</button>
              <button onClick={handleClearData} disabled={clearing} className="btn-danger">
                {clearing ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
