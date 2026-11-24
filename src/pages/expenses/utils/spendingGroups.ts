// Крупные группы трат: ~30 категорий банка сводятся к 9 понятным корзинам

export interface SpendingGroup {
  key: string
  name: string
  color: string
  icon: string
}

const OTHER_KEY = 'other'

export const SPENDING_GROUPS: SpendingGroup[] = [
  { key: 'groceries', name: 'Продукты', color: 'var(--fp-cat-4)', icon: '🛒' },
  { key: 'food-out', name: 'Кафе и рестораны', color: 'var(--fp-cat-3)', icon: '🍽️' },
  { key: 'transfers', name: 'Переводы людям', color: 'var(--fp-cat-2)', icon: '👤' },
  { key: 'auto', name: 'Авто и транспорт', color: 'var(--fp-cat-7)', icon: '🚗' },
  { key: 'health', name: 'Здоровье и красота', color: 'var(--fp-cat-8)', icon: '💊' },
  { key: 'shopping', name: 'Покупки', color: 'var(--fp-cat-5)', icon: '🛍️' },
  { key: 'services', name: 'Связь и сервисы', color: 'var(--fp-cat-6)', icon: '📱' },
  { key: 'cash', name: 'Наличные', color: 'var(--fp-cat-1)', icon: '💵' },
  { key: OTHER_KEY, name: 'Прочее', color: 'var(--text-muted)', icon: '💳' }
]

const CATEGORY_TO_GROUP: Record<string, string> = {
  'Супермаркеты': 'groceries',
  'Фастфуд': 'food-out',
  'Рестораны': 'food-out',
  'Переводы': 'transfers',
  'Заправки': 'auto',
  'Автоуслуги': 'auto',
  'Платные дороги': 'auto',
  'Такси': 'auto',
  'Местный транспорт': 'auto',
  'Транспорт': 'auto',
  'Каршеринг': 'auto',
  'Авиабилеты': 'auto',
  'Ж/д билеты': 'auto',
  'Аптеки': 'health',
  'Медицина': 'health',
  'Красота': 'health',
  'Маркетплейсы': 'shopping',
  'Цветы': 'shopping',
  'Различные товары': 'shopping',
  'Ремонт и мебель': 'shopping',
  'Дом и ремонт': 'shopping',
  'Детские товары': 'shopping',
  'Одежда и обувь': 'shopping',
  'Электроника и техника': 'shopping',
  'Спорттовары': 'shopping',
  'Животные': 'shopping',
  'Книги': 'shopping',
  'Мобильная связь': 'services',
  'Связь': 'services',
  'Цифровые товары': 'services',
  'Сервис': 'services',
  'Экосистема Яндекс': 'services',
  'Наличные': 'cash'
}

// Уточнение значка поверх группы: категории банка -> эмодзи
const CATEGORY_ICON: Record<string, string> = {
  'Супермаркеты': '🛒',
  'Фастфуд': '🍔',
  'Рестораны': '🍽️',
  'Переводы': '👤',
  'Заправки': '⛽',
  'Автоуслуги': '🔧',
  'Платные дороги': '🛣️',
  'Такси': '🚕',
  'Местный транспорт': '🚌',
  'Транспорт': '🚌',
  'Каршеринг': '🚙',
  'Авиабилеты': '✈️',
  'Ж/д билеты': '🚆',
  'Аптеки': '💊',
  'Медицина': '🩺',
  'Красота': '💇',
  'Маркетплейсы': '📦',
  'Цветы': '💐',
  'Различные товары': '🛍️',
  'Ремонт и мебель': '🛠️',
  'Дом и ремонт': '🏠',
  'Детские товары': '🧸',
  'Одежда и обувь': '👕',
  'Электроника и техника': '💻',
  'Спорттовары': '⚽',
  'Животные': '🐾',
  'Книги': '📚',
  'Мобильная связь': '📱',
  'Связь': '📡',
  'Цифровые товары': '🎮',
  'Сервис': '⚙️',
  'Экосистема Яндекс': '🟡',
  'Наличные': '💵'
}

const GROUP_BY_KEY = new Map(SPENDING_GROUPS.map(group => [group.key, group]))

export function getSpendingGroup(bankCategory: string | null): SpendingGroup {
  const category = (bankCategory || '').replace(/\u00A0/g, ' ').trim()
  const key = CATEGORY_TO_GROUP[category] || OTHER_KEY
  return GROUP_BY_KEY.get(key) as SpendingGroup
}

export function getCategoryIcon(bankCategory: string | null): string {
  const category = (bankCategory || '').replace(/\u00A0/g, ' ').trim()
  return CATEGORY_ICON[category] || getSpendingGroup(bankCategory).icon
}
