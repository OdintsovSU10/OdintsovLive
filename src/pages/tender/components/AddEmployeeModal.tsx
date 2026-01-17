import { X } from 'lucide-react'

interface Props {
  formName: string
  formPosition: string
  formHireDate: string
  formSalary: string
  setFormName: (v: string) => void
  setFormPosition: (v: string) => void
  setFormHireDate: (v: string) => void
  setFormSalary: (v: string) => void
  onClose: () => void
  onSave: () => void
}

export default function AddEmployeeModal({
  formName,
  formPosition,
  formHireDate,
  formSalary,
  setFormName,
  setFormPosition,
  setFormHireDate,
  setFormSalary,
  onClose,
  onSave
}: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Новый сотрудник</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>ФИО</label>
            <input
              type="text"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="Иванов Иван Иванович"
            />
          </div>
          <div className="form-group">
            <label>Должность</label>
            <input
              type="text"
              value={formPosition}
              onChange={e => setFormPosition(e.target.value)}
              placeholder="Специалист"
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Дата трудоустройства</label>
              <input
                type="date"
                value={formHireDate}
                onChange={e => setFormHireDate(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Оклад</label>
              <input
                type="text"
                inputMode="numeric"
                value={formSalary}
                onChange={e => setFormSalary(e.target.value)}
                placeholder="50 000"
              />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            Отмена
          </button>
          <button className="btn-save" onClick={onSave}>
            Добавить
          </button>
        </div>
      </div>
    </div>
  )
}
