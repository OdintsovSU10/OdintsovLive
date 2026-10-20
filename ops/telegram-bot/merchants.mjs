// Правила «мерчант → название и категория» для банковских операций. Нейронка размечает
// только новые мерчанты, результат кэшируется в expense_merchant_rules; правки пользователя
// (source='user') не перезаписываются. Портал накладывает правила поверх операций на лету.
import { setTimeout as sleep } from 'node:timers/promises'
import { OPENROUTER_URL } from './llm.mjs'

const POLL_MS = 5 * 60_000
const BATCH_SIZE = 40
const NO_CATEGORY_NAME = 'Прочее'

// Набор категорий, если у пользователя своих ещё нет
const DEFAULT_CATEGORIES = [
  ['Продукты', '#16A34A'],
  ['Кафе и фастфуд', '#F97316'],
  ['Доставка еды', '#EA580C'],
  ['Транспорт', '#0EA5E9'],
  ['Авто', '#64748B'],
  ['Здоровье', '#EF4444'],
  ['Дом и быт', '#A16207'],
  ['Одежда и обувь', '#8B5CF6'],
  ['Красота', '#EC4899'],
  ['Развлечения', '#F59E0B'],
  ['Подписки и связь', '#6366F1'],
  ['Цветы и подарки', '#F43F5E'],
  ['Переводы людям', '#14B8A6'],
  ['Свои счета', '#94A3B8'],
  [NO_CATEGORY_NAME, '#78716C']
]

// Должен совпадать с merchantKey в src/pages/expenses/utils/analysis.ts
export const merchantKey = description => (description || '')
  .toLowerCase()
  .replace(/[_\s-]*sbp$/i, '')
  .replace(/["«»'.,()]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const PAGE = 1000

const loadMerchants = async (rest, userId) => {
  const merchants = new Map()
  for (let from = 0; ; from += PAGE) {
    const rows = await rest(
      `expense_transactions?user_id=eq.${userId}&description=not.is.null&select=description,bank_category,mcc,payment_amount,flow_direction&order=id.asc&limit=${PAGE}&offset=${from}`
    )
    for (const row of rows) {
      const key = merchantKey(row.description)
      if (!key) continue
      const item = merchants.get(key) || { key, description: row.description.trim(), bankCategory: row.bank_category, mcc: row.mcc, count: 0, total: 0 }
      item.count += 1
      item.total += Math.abs(Number(row.payment_amount) || 0)
      merchants.set(key, item)
    }
    if (rows.length < PAGE) break
  }
  return merchants
}

const ensureCategories = async (rest, userId) => {
  let categories = await rest(`expense_user_categories?user_id=eq.${userId}&is_active=eq.true&select=id,name&order=sort_order.asc`)
  if (categories.length === 0) {
    categories = await rest('expense_user_categories', {
      method: 'POST',
      body: JSON.stringify(DEFAULT_CATEGORIES.map(([name, color], index) => ({ user_id: userId, name, color, sort_order: index })))
    })
  }
  return categories
}

const classify = async (config, categoryNames, batch) => {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.openrouterKey}`, 'Content-Type': 'application/json', 'X-Title': 'Odintsov Live bot' },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      max_tokens: 4096,
      tool_choice: { type: 'function', function: { name: 'set_merchants' } },
      tools: [{
        type: 'function',
        function: {
          name: 'set_merchants',
          description: 'Название и категория для каждого мерчанта из списка',
          parameters: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    key: { type: 'string', description: 'key из входного списка, без изменений' },
                    name: { type: 'string', description: 'Короткое понятное название: «Магнит», «Яндекс Go». Для перевода человеку — как есть («Артем О.»)' },
                    category: { type: 'string', enum: categoryNames }
                  },
                  required: ['key', 'name', 'category']
                }
              }
            },
            required: ['items']
          }
        }
      }],
      messages: [
        {
          role: 'system',
          content: `Ты размечаешь банковские операции физлица (Россия). Для каждого мерчанта дай короткое название и категорию строго из списка: ${categoryNames.join('; ')}.
Перевод с именем и инициалом («Артем О.») — «Переводы людям». «Между своими счетами», «Кубышка», «Инвесткопилка», «Себе в другой банк» — «Свои счета».
Магазины у дома и супермаркеты — «Продукты», аптеки — «Здоровье», заправки и автоуслуги — «Авто». Не уверен — «${NO_CATEGORY_NAME}».
Подсказки: банковская категория и MCC.`
        },
        {
          role: 'user',
          content: JSON.stringify(batch.map(m => ({
            key: m.key,
            description: m.description,
            bank_category: m.bankCategory,
            mcc: m.mcc,
            count: m.count,
            avg_amount: Math.round(m.total / m.count)
          })))
        }
      ]
    }),
    signal: AbortSignal.timeout(90_000)
  })
  const data = await res.json().catch(() => null)
  const call = data?.choices?.[0]?.message?.tool_calls?.[0]
  if (!res.ok || !call) throw new Error(`OpenRouter ${res.status}: ${data?.error?.message || 'пустой ответ'}`)
  const args = typeof call.function.arguments === 'string' ? JSON.parse(call.function.arguments || '{}') : call.function.arguments
  return Array.isArray(args?.items) ? args.items : []
}

// Размечает мерчантов без правила; возвращает, сколько правил добавлено
export const classifyNewMerchants = async (rest, config, log) => {
  const userId = config.userId
  const merchants = await loadMerchants(rest, userId)
  const known = new Set((await rest(`expense_merchant_rules?user_id=eq.${userId}&select=merchant_key&limit=100000`)).map(r => r.merchant_key))
  const fresh = [...merchants.values()].filter(m => !known.has(m.key))
  if (fresh.length === 0) return 0

  const categories = await ensureCategories(rest, userId)
  const idByName = new Map(categories.map(c => [c.name, c.id]))
  const names = categories.map(c => c.name)
  const fallbackId = idByName.get(NO_CATEGORY_NAME) || null

  let added = 0
  for (let i = 0; i < fresh.length; i += BATCH_SIZE) {
    const batch = fresh.slice(i, i + BATCH_SIZE)
    const byKey = new Map(batch.map(m => [m.key, m]))
    const items = await classify(config, names, batch)
    const rows = items
      .filter(item => byKey.has(item.key))
      .map(item => ({
        user_id: userId,
        merchant_key: item.key,
        display_name: String(item.name || '').trim().slice(0, 80) || null,
        category_id: idByName.get(item.category) || fallbackId,
        source: 'llm'
      }))
    if (rows.length === 0) continue
    // ignore-duplicates: правка пользователя, сделанная пока шёл запрос, не затирается
    await rest('expense_merchant_rules?on_conflict=user_id,merchant_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(rows)
    })
    added += rows.length
  }
  log(`merchants: размечено ${added} из ${fresh.length}`)
  return added
}

export const startMerchantWorker = (rest, getConfig, log) => {
  const loop = async () => {
    while (true) {
      try {
        const config = getConfig()
        if (config?.openrouterKey && config.userId) await classifyNewMerchants(rest, config, log)
      } catch (err) {
        log('merchant worker:', err.message || err)
      }
      await sleep(POLL_MS)
    }
  }
  void loop()
}
