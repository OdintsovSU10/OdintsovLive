import { lazy, Suspense, useCallback, useEffect, useState, type FC } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import type { EmployeeWithStats } from '../../types'
import { OFFICE_SEATS } from './officeLayout'
import type { IOffice3DProps } from './Office3D'
import { OfficePlan } from './OfficePlan'
import { TONE_CLASS } from './officeTones'
import { useOfficeSeats } from './useOfficeSeats'
import styles from './Office.module.css'

const LOADING_TEXT = 'Загрузка…'
const VIEW_STORAGE_KEY = 'tender-office-view'

type TOfficeView = '3d' | 'plan'

const VIEWS: ReadonlyArray<{ id: TOfficeView; label: string }> = [
  { id: '3d', label: '3D' },
  { id: 'plan', label: 'План' }
]

// Чанк с three не загрузился (нет сети): ведём себя как при отсутствии WebGL
const Office3DFailed: FC<IOffice3DProps> = ({ onUnsupported }) => {
  useEffect(() => {
    onUnsupported()
  }, [onUnsupported])
  return null
}

// three уходит в отдельный чанк: он грузится только когда открыт 3D-вид
const Office3D = lazy(() =>
  import('./Office3D')
    .then(module => ({ default: module.Office3D }))
    .catch(() => ({ default: Office3DFailed }))
)

const joinClasses = (...names: Array<string | undefined>): string => names.filter(Boolean).join(' ')

const readStoredView = (): TOfficeView => {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'plan' ? 'plan' : '3d'
  } catch {
    return '3d'
  }
}

const storeView = (view: TOfficeView): void => {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view)
  } catch {
    // Хранилище недоступно (приватный режим): выбор живёт до перезагрузки
  }
}

interface IOfficeFloorProps {
  allEmployees: EmployeeWithStats[]
}

export const OfficeFloor: FC<IOfficeFloorProps> = ({ allEmployees }) => {
  const { states, phase, inOffice, updatedAt, busy, bannerText, refresh } = useOfficeSeats(allEmployees)
  const [view, setView] = useState<TOfficeView>(readStoredView)
  // WebGL недоступен: показываем план, но сохранённый выбор не затираем
  const [webglFailed, setWebglFailed] = useState(false)
  const activeView: TOfficeView = webglFailed ? 'plan' : view

  const handleSelect = (next: TOfficeView): void => {
    setView(next)
    storeView(next)
  }
  const handleUnsupported = useCallback(() => setWebglFailed(true), [])

  return (
    <section className={joinClasses(styles.office, phase === 'unavailable' ? styles.frozen : undefined)} aria-busy={phase === 'loading'}>
      <div className={styles.toolbar}>
        <div className={styles.summary}>
          <strong className={styles.count}>
            В офисе: {phase === 'ready' ? inOffice : '—'} из {OFFICE_SEATS.length}
          </strong>
          {phase === 'loading' && (
            <span className={styles.loadingNote} role="status">
              <span className={styles.spinner} aria-hidden="true" />
              {LOADING_TEXT}
            </span>
          )}
          {updatedAt && phase !== 'loading' && <span className={styles.updated}>Обновлено в {updatedAt}</span>}
        </div>
        <div className={styles.toolbarActions}>
          <div className={styles.viewSwitch} role="radiogroup" aria-label="Вид офиса">
            {VIEWS.map(item => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={activeView === item.id}
                className={joinClasses(styles.viewButton, activeView === item.id ? styles.viewButtonActive : undefined)}
                onClick={() => handleSelect(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button type="button" className={styles.refresh} onClick={refresh} disabled={busy}>
            <RefreshCw size={18} strokeWidth={1.5} className={busy ? styles.spinning : undefined} aria-hidden="true" />
            <span>Обновить</span>
          </button>
        </div>
      </div>

      {phase === 'unavailable' && (
        <div className={styles.banner} role="alert">
          <TriangleAlert size={18} strokeWidth={1.5} aria-hidden="true" />
          <span>{bannerText}</span>
        </div>
      )}

      {webglFailed && (
        <div className={styles.banner} role="status">
          <TriangleAlert size={18} strokeWidth={1.5} aria-hidden="true" />
          <span>3D не поддерживается браузером</span>
        </div>
      )}

      {activeView === '3d' ? (
        <Suspense
          fallback={
            <div className={styles.viewLoading} role="status">
              <span className={styles.spinner} aria-hidden="true" />
              {LOADING_TEXT}
            </div>
          }
        >
          <Office3D states={states} frozen={phase === 'unavailable'} onUnsupported={handleUnsupported} />
        </Suspense>
      ) : (
        <OfficePlan states={states} />
      )}

      <ul className={styles.list}>
        {states.map(state => (
          <li key={state.seat.no} className={joinClasses(styles.item, TONE_CLASS[state.tone])}>
            <span className={styles.marker} aria-hidden="true" />
            <span className={styles.itemText}>
              <span className={styles.itemName}>{state.name}</span>
              <span className={styles.itemStatus}>{state.status || LOADING_TEXT}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
