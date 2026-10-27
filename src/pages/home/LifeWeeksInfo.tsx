import { fmtEventDate, type ILifeModel } from './lifeWeeks'

interface Props {
  model: ILifeModel
}

// Подпись («Неделя … из …») и легенда памятных дат — общая для карточки и листа
export const LifeWeeksInfo = ({ model }: Props) => (
  <>
    <p className="life-caption">{model.caption}</p>
    {model.marks.length > 0 && (
      <ul className="life-legend">
        {model.marks.map(mark => (
          <li key={`${mark.date}-${mark.label}`} className="life-legend-item">
            <span className="life-dot" style={{ background: mark.color }} aria-hidden="true" />
            <span className="life-legend-date">{fmtEventDate(mark.date)}</span>
            <span className="life-legend-label">{mark.label}</span>
          </li>
        ))}
      </ul>
    )}
  </>
)
