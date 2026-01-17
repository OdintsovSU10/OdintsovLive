import { useEffect, useState } from 'react'
import { Users, Plus, Upload, Archive, Cake, Search, Pencil, Check, BarChart3 } from 'lucide-react'
import { useTenderData } from './hooks/useTenderData'
import { Employee, ImportPreview, EditedEmployee } from './types'
import { filterEmployees } from './utils'
import {
  BirthdayCalendar,
  FiltersBar,
  AddEmployeeModal,
  ImportPreviewModal,
  EmployeeSidebar,
  EmployeeTable,
  AnalyticsTab
} from './components'
import '../TenderPage.css'

export default function TenderPage() {
  const {
    employees,
    salaryHistory,
    loading,
    loadEmployees,
    addEmployee,
    archiveEmployee,
    restoreEmployee,
    massArchive,
    saveEditedEmployees,
    addRaise,
    deleteRaise,
    parseImportFile,
    confirmImport
  } = useTenderData()

  const [showArchived, setShowArchived] = useState(false)
  const [archivedEmployees, setArchivedEmployees] = useState<Employee[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [showAddRaise, setShowAddRaise] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreview[]>([])
  const [showImportPreview, setShowImportPreview] = useState(false)
  const [importing, setImporting] = useState(false)
  const [activeTab, setActiveTab] = useState<'list' | 'birthdays' | 'analytics'>('list')
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [filterGroups, setFilterGroups] = useState<string[]>([])
  const [filterPositions, setFilterPositions] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [replaceOnImport, setReplaceOnImport] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [selectedForArchive, setSelectedForArchive] = useState<number[]>([])
  const [editedEmployees, setEditedEmployees] = useState<{ [id: number]: EditedEmployee }>({})

  // Form states
  const [formName, setFormName] = useState('')
  const [formPosition, setFormPosition] = useState('')
  const [formHireDate, setFormHireDate] = useState('')
  const [formSalary, setFormSalary] = useState('')
  const [raiseAmount, setRaiseAmount] = useState('')
  const [raiseDate, setRaiseDate] = useState(new Date().toISOString().split('T')[0])
  const [raiseNote, setRaiseNote] = useState('')

  useEffect(() => {
    loadEmployees(showArchived)
  }, [showArchived, loadEmployees])

  // Загрузка архивных сотрудников для аналитики
  useEffect(() => {
    if (activeTab === 'analytics') {
      import('../../lib/supabase').then(({ supabase }) => {
        supabase
          .from('tender_employees')
          .select('*')
          .eq('is_archived', true)
          .then(({ data }: { data: Employee[] | null }) => {
            if (data) setArchivedEmployees(data)
          })
      })
    }
  }, [activeTab])

  const uniqueGroups = [...new Set(employees.map(e => e.group_name).filter(Boolean))] as string[]
  const uniquePositions = [...new Set(employees.map(e => e.position).filter(Boolean))]
  const filteredEmployees = filterEmployees(employees, filterGroups, filterPositions, searchQuery)

  const resetForm = () => {
    setFormName('')
    setFormPosition('')
    setFormHireDate('')
    setFormSalary('')
  }

  const handleAddEmployee = async () => {
    if (!formName || !formPosition || !formHireDate || !formSalary) return
    const success = await addEmployee(formName, formPosition, formHireDate, formSalary)
    if (success) {
      loadEmployees(showArchived)
      resetForm()
      setShowAddEmployee(false)
    }
  }

  const handleMassArchive = async () => {
    if (selectedForArchive.length === 0) return
    if (!confirm(`Перевести в архив ${selectedForArchive.length} сотрудников?`)) return
    await massArchive(selectedForArchive)
    setSelectedForArchive([])
    loadEmployees(showArchived)
  }

  const handleExitEditMode = async () => {
    if (Object.keys(editedEmployees).length > 0) {
      await saveEditedEmployees(editedEmployees)
      loadEmployees(showArchived)
    }
    setEditMode(false)
    setSelectedForArchive([])
    setEditedEmployees({})
  }

  const handleAddRaise = async () => {
    if (!selectedEmployee || !raiseAmount || !raiseDate) return
    await addRaise(selectedEmployee, raiseAmount, raiseDate, raiseNote)
    loadEmployees(showArchived)
    setRaiseAmount('')
    setRaiseDate(new Date().toISOString().split('T')[0])
    setRaiseNote('')
    setShowAddRaise(false)
  }

  const handleDeleteRaise = async (historyId: number, employeeId: number) => {
    if (!confirm('Удалить эту запись?')) return
    await deleteRaise(historyId, employeeId)
    loadEmployees(showArchived)
  }

  const handleArchiveEmployee = async () => {
    if (!selectedEmployee) return
    await archiveEmployee(selectedEmployee.id)
    loadEmployees(showArchived)
    setSelectedEmployee(null)
  }

  const handleRestoreEmployee = async () => {
    if (!selectedEmployee) return
    await restoreEmployee(selectedEmployee.id)
    loadEmployees(showArchived)
  }

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const preview = await parseImportFile(file)
    setImportPreview(preview)
    setShowImportPreview(true)
    e.target.value = ''
  }

  const handleConfirmImport = async () => {
    setImporting(true)
    await confirmImport(importPreview, replaceOnImport)
    setImporting(false)
    setShowImportPreview(false)
    setImportPreview([])
    setReplaceOnImport(false)
    loadEmployees(showArchived)
  }

  const closeSidebar = () => {
    setSelectedEmployee(null)
    setShowAddRaise(false)
  }

  return (
    <div className="tender-page">
      <div className="tender-header">
        <div className="tender-title">
          <Users size={24} />
          <h1>Тендерный отдел</h1>
        </div>
      </div>

      <div className="tender-toolbar">
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Поиск..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <label className="archive-toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={e => setShowArchived(e.target.checked)}
          />
          <span className="toggle-track" />
          <span>Архив</span>
        </label>
        <div className="tender-actions">
          {editMode ? (
            <>
              {selectedForArchive.length > 0 && (
                <button className="btn-mass-archive" onClick={handleMassArchive}>
                  <Archive size={18} />
                  <span>В архив ({selectedForArchive.length})</span>
                </button>
              )}
              <button className="btn-edit-done" onClick={handleExitEditMode}>
                <Check size={18} />
                <span>Готово</span>
              </button>
            </>
          ) : (
            <>
              <button className="btn-edit-mode" onClick={() => setEditMode(true)} title="Режим редактирования">
                <Pencil size={18} />
              </button>
              <label className="btn-import">
                <Upload size={18} />
                <span>Импорт</span>
                <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} hidden />
              </label>
              <button className="btn-add" onClick={() => setShowAddEmployee(true)}>
                <Plus size={18} />
                <span>Сотрудник</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="tender-tabs">
        <button className={`tab ${activeTab === 'list' ? 'active' : ''}`} onClick={() => setActiveTab('list')}>
          <Users size={16} />
          <span>Список</span>
        </button>
        <button className={`tab ${activeTab === 'birthdays' ? 'active' : ''}`} onClick={() => setActiveTab('birthdays')}>
          <Cake size={16} />
          <span>Дни рождения</span>
        </button>
        <button className={`tab ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>
          <BarChart3 size={16} />
          <span>Анализ</span>
        </button>
      </div>

      {activeTab === 'list' && (
        <FiltersBar
          uniqueGroups={uniqueGroups}
          uniquePositions={uniquePositions}
          filterGroups={filterGroups}
          filterPositions={filterPositions}
          setFilterGroups={setFilterGroups}
          setFilterPositions={setFilterPositions}
        />
      )}

      {activeTab === 'analytics' ? (
        <AnalyticsTab
          employees={employees}
          archivedEmployees={archivedEmployees}
          salaryHistory={salaryHistory}
        />
      ) : activeTab === 'birthdays' ? (
        <BirthdayCalendar
          calendarMonth={calendarMonth}
          setCalendarMonth={setCalendarMonth}
          employees={employees}
          onSelectEmployee={setSelectedEmployee}
        />
      ) : (
        <EmployeeTable
          employees={filteredEmployees}
          salaryHistory={salaryHistory}
          loading={loading}
          showArchived={showArchived}
          editMode={editMode}
          selectedEmployee={selectedEmployee}
          selectedForArchive={selectedForArchive}
          editedEmployees={editedEmployees}
          onSelectEmployee={setSelectedEmployee}
          onToggleSelectForArchive={(id) => setSelectedForArchive(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
          )}
          onUpdateEditedEmployee={(id, field, value) => setEditedEmployees(prev => ({
            ...prev,
            [id]: { ...prev[id], [field]: value }
          }))}
          onQuickRaise={(emp) => { setSelectedEmployee(emp); setShowAddRaise(true) }}
        />
      )}

      {showAddEmployee && (
        <AddEmployeeModal
          formName={formName}
          formPosition={formPosition}
          formHireDate={formHireDate}
          formSalary={formSalary}
          setFormName={setFormName}
          setFormPosition={setFormPosition}
          setFormHireDate={setFormHireDate}
          setFormSalary={setFormSalary}
          onClose={() => { setShowAddEmployee(false); resetForm() }}
          onSave={handleAddEmployee}
        />
      )}

      {selectedEmployee && (
        <EmployeeSidebar
          employee={selectedEmployee}
          salaryHistory={salaryHistory}
          showAddRaise={showAddRaise}
          raiseAmount={raiseAmount}
          raiseDate={raiseDate}
          raiseNote={raiseNote}
          setShowAddRaise={setShowAddRaise}
          setRaiseAmount={setRaiseAmount}
          setRaiseDate={setRaiseDate}
          setRaiseNote={setRaiseNote}
          onClose={closeSidebar}
          onAddRaise={handleAddRaise}
          onArchive={handleArchiveEmployee}
          onRestore={handleRestoreEmployee}
          onDeleteRaise={handleDeleteRaise}
        />
      )}

      {showImportPreview && (
        <ImportPreviewModal
          importPreview={importPreview}
          replaceOnImport={replaceOnImport}
          importing={importing}
          setReplaceOnImport={setReplaceOnImport}
          onClose={() => setShowImportPreview(false)}
          onConfirm={handleConfirmImport}
        />
      )}
    </div>
  )
}
