export type ParamKey =
  | 'bicep_left' | 'bicep_right'
  | 'forearm_left' | 'forearm_right'
  | 'chest' | 'shoulders' | 'waist' | 'glutes'
  | 'calf_left' | 'calf_right'
  | 'thigh_left' | 'thigh_right'

export interface IParamField {
  key: ParamKey
  label: string
  // Короткая подпись для плитки: «Бицепс Л» вместо «Бицепс левый»
  short: string
}

export const PARAMS_CONFIG: readonly IParamField[] = [
  { key: 'bicep_left', label: 'Бицепс левый', short: 'Бицепс Л' },
  { key: 'bicep_right', label: 'Бицепс правый', short: 'Бицепс П' },
  { key: 'forearm_left', label: 'Предплечье левое', short: 'Предплечье Л' },
  { key: 'forearm_right', label: 'Предплечье правое', short: 'Предплечье П' },
  { key: 'chest', label: 'Грудь', short: 'Грудь' },
  { key: 'shoulders', label: 'Плечи', short: 'Плечи' },
  { key: 'waist', label: 'Талия', short: 'Талия' },
  { key: 'glutes', label: 'Ягодицы', short: 'Ягодицы' },
  { key: 'calf_left', label: 'Икра левая', short: 'Икра Л' },
  { key: 'calf_right', label: 'Икра правая', short: 'Икра П' },
  { key: 'thigh_left', label: 'Бедро левое', short: 'Бедро Л' },
  { key: 'thigh_right', label: 'Бедро правое', short: 'Бедро П' }
]

export const PARAM_SHORT_LABELS = Object.fromEntries(
  PARAMS_CONFIG.map(p => [p.key, p.short])
) as Record<ParamKey, string>

export const PARAM_LABELS = Object.fromEntries(
  PARAMS_CONFIG.map(p => [p.key, p.label])
) as Record<ParamKey, string>

// Группы полей: одиночные, затем парные Л/П — одинаково для плиток и формы
export const SINGLE_KEYS: readonly ParamKey[] = ['chest', 'shoulders', 'waist', 'glutes']

export interface IParamPair {
  title: string
  left: ParamKey
  right: ParamKey
}

export const PAIRS: readonly IParamPair[] = [
  { title: 'Бицепс', left: 'bicep_left', right: 'bicep_right' },
  { title: 'Предплечье', left: 'forearm_left', right: 'forearm_right' },
  { title: 'Бедро', left: 'thigh_left', right: 'thigh_right' },
  { title: 'Икра', left: 'calf_left', right: 'calf_right' }
]

// Порядок плиток: одиночные, потом пары (левый, правый)
export const TILE_KEYS: readonly ParamKey[] = [
  ...SINGLE_KEYS,
  ...PAIRS.flatMap(pair => [pair.left, pair.right])
]

export type ParamValues = Record<ParamKey, number | null>

export interface IBodyParams extends ParamValues {
  id: string
  date: string
}

export interface IBodyWeight {
  id: string
  date: string
  weight: number
}

export const DEFAULT_PARAM: ParamKey = 'waist'
