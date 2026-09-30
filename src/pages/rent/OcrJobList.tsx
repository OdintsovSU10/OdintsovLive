import { Trash2 } from 'lucide-react'
import type { RecognizedMeter } from './rentUtils'
import type { OcrJob, OcrJobStatus } from './meterOcr'
import './OcrJobList.css'

interface OcrJobListProps {
  jobs: OcrJob[]
  onRemove: (id: string) => void
}

const STATUS_LABELS: Record<OcrJobStatus, string> = {
  pending: 'в очереди',
  processing: 'распознаётся…',
  done: 'готово',
  error: 'ошибка'
}

const formatMeter = (m: RecognizedMeter) => {
  if (m.kind === 'electricity') {
    return `${m.tariff ?? 'Эл.'}: ${m.value.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} кВт·ч`
  }
  return `Вода: ${m.value.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} м³`
}

// История распознавания фото за месяц — свёрнута под таблицей показаний
export default function OcrJobList({ jobs, onRemove }: OcrJobListProps) {
  const doneCount = jobs.filter(j => j.status === 'done').length

  return (
    <details className="ocr-history">
      <summary>Фото: {doneCount} из {jobs.length} распознано</summary>
      <ul className="ocr-jobs">
        {jobs.map(job => (
          <li key={job.id} className={`ocr-job is-${job.status}`}>
            <span className="ocr-job-status">{STATUS_LABELS[job.status]}</span>
            <span className="ocr-job-result">
              {job.status === 'done' && (job.result?.meters.length
                ? job.result.meters.map(formatMeter).join(' · ')
                : 'счётчики не найдены')}
              {job.status === 'error' && job.error}
            </span>
            <button className="ocr-job-delete" onClick={() => onRemove(job.id)} aria-label="Удалить">
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}
