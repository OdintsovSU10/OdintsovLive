import { MeasurementsCard } from './components/MeasurementsCard'
import { WeightCard } from './components/WeightCard'
import { useBodyParams } from './hooks/useBodyParams'
import { useBodyWeight } from './hooks/useBodyWeight'
import './BodyPage.css'

export default function BodyPage() {
  const weight = useBodyWeight()
  const params = useBodyParams()

  return (
    <div className="body-shell">
      <div className="body-layout">
        <WeightCard
          records={weight.records}
          loading={weight.loading}
          loadError={weight.loadError}
          onSave={weight.save}
          onRemove={weight.remove}
        />
        <MeasurementsCard
          records={params.records}
          loading={params.loading}
          loadError={params.loadError}
          onSave={params.save}
          onRemove={params.remove}
        />
      </div>
    </div>
  )
}
