export const SELECT_ALL = 'all'
export const SELECT_IMPORTANT = 'important'
export const IMPORTANT_MIN = 55

export const isSpecialSelection = (value: string): boolean => value === SELECT_ALL || value === SELECT_IMPORTANT

// Выбранный пункт списка слева -> параметры запроса ленты (канал — это его id)
export const getFeedFilter = (selection: string): { channelId: string; minImportance: number } => {
  if (selection === SELECT_ALL) return { channelId: '', minImportance: 0 }
  if (selection === SELECT_IMPORTANT) return { channelId: '', minImportance: IMPORTANT_MIN }
  return { channelId: selection, minImportance: 0 }
}
