// Крупные группы трат: ~30 категорий банка сводятся к 9 понятным корзинам

export interface SpendingGroup {
  key: string
  name: string
  color: string
}

const OTHER_KEY = 'other'

export const SPENDING_GROUPS: SpendingGroup[] = [
  { key: 'groceries', name: 'Продукты', color: 'var(--fp-cat-4)' },
  { key: 'food-out', name: 'Кафе и рестораны', color: 'var(--fp-cat-3)' },
  { key: 'transfers', name: 'Переводы людям', color: 'var(--fp-cat-2)' },
  { key: 'auto', name: 'Авто и транспорт', color: 'var(--fp-cat-7)' },
  { key: 'health', name: 'Здоровье и красота', color: 'var(--fp-cat-8)' },
  { key: 'shopping', name: 'Покупки', color: 'var(--fp-cat-5)' },
  { key: 'services', name: 'Связь и сервисы', color: 'var(--fp-cat-6)' },
  { key: 'cash', name: 'Наличные', color: 'var(--fp-cat-1)' },
  { key: OTHER_KEY, name: 'Прочее', color: 'var(--text-muted)' }
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

const GROUP_BY_KEY = new Map(SPENDING_GROUPS.map(group => [group.key, group]))

export function getSpendingGroup(bankCategory: string | null): SpendingGroup {
  const category = (bankCategory || '').replace(/\u00A0/g, ' ').trim()
  const key = CATEGORY_TO_GROUP[category] || OTHER_KEY
  return GROUP_BY_KEY.get(key) as SpendingGroup
}
