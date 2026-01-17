interface Props {
  uniqueGroups: string[]
  uniquePositions: string[]
  filterGroups: string[]
  filterPositions: string[]
  setFilterGroups: (v: string[]) => void
  setFilterPositions: (v: string[]) => void
}

export default function FiltersBar({
  uniqueGroups,
  uniquePositions,
  filterGroups,
  filterPositions,
  setFilterGroups,
  setFilterPositions
}: Props) {
  const toggleFilter = (value: string, current: string[], setter: (v: string[]) => void) => {
    if (current.includes(value)) {
      setter(current.filter(v => v !== value))
    } else {
      setter([...current, value])
    }
  }

  if (uniqueGroups.length === 0 && uniquePositions.length === 0) return null

  return (
    <div className="filters-bar">
      {uniqueGroups.length > 0 && (
        <div className="filter-group">
          <span className="filter-label">Группа:</span>
          {uniqueGroups.map(g => (
            <label key={g} className={`filter-chip ${filterGroups.includes(g) ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={filterGroups.includes(g)}
                onChange={() => toggleFilter(g, filterGroups, setFilterGroups)}
              />
              {g}
            </label>
          ))}
        </div>
      )}
      {uniquePositions.length > 0 && (
        <div className="filter-group">
          <span className="filter-label">Должность:</span>
          {uniquePositions.map(p => (
            <label key={p} className={`filter-chip ${filterPositions.includes(p) ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={filterPositions.includes(p)}
                onChange={() => toggleFilter(p, filterPositions, setFilterPositions)}
              />
              {p}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
