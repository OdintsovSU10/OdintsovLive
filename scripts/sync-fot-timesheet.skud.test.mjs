// Тест расчёта дня СКУД: node scripts/sync-fot-timesheet.skud.test.mjs
// Ожидаемые значения сверены с calculateFotSkudDay (src/pages/tender/utils/skudTimeCalculation.ts).
import assert from 'node:assert/strict'

process.env.FOT_SYNC_NO_MAIN = '1'
const { calculateSkudDayStats } = await import('./sync-fot-timesheet.mjs')

let counter = 0
// Событие: [время, направление, точка]
const day = (...items) => items.map(([time, direction, accessPoint = 'A']) => {
  counter += 1
  return { id: `e${counter}`, time, accessPoint, direction }
})

const cases = [
  {
    name: 'обычный день: вход/выход',
    events: day(['08:00:00', 'entry'], ['17:00:00', 'exit']),
    expected: {
      events_count: 2, exits_count: 0, outside_minutes: 0, presence_minutes: 540,
      first_entry: '08:00:00', last_exit: '17:00:00', has_open_pair: false
    }
  },
  {
    name: 'три перерыва',
    events: day(
      ['08:00:00', 'entry'], ['10:00:00', 'exit'],
      ['10:15:00', 'entry'], ['12:00:00', 'exit'],
      ['13:00:00', 'entry'], ['15:30:00', 'exit'],
      ['15:40:30', 'entry'], ['18:00:00', 'exit']
    ),
    expected: {
      events_count: 8, exits_count: 3, outside_minutes: 86, presence_minutes: 515,
      first_entry: '08:00:00', last_exit: '18:00:00', has_open_pair: false
    }
  },
  {
    name: 'непарные: повтор входа на той же точке, вход на другой точке, выход без входа',
    events: day(
      ['07:00:00', 'exit'],
      ['08:00:00', 'entry', 'A'], ['08:30:00', 'entry', 'A'],
      ['09:00:00', 'entry', 'B'],
      ['12:00:00', 'exit', 'A'], ['12:10:00', 'exit', 'A'],
      ['13:00:00', 'entry', 'A'], ['14:00:00', 'exit', 'A']
    ),
    expected: {
      events_count: 8, exits_count: 1, outside_minutes: 60, presence_minutes: 270,
      first_entry: '08:00:00', last_exit: '14:00:00', has_open_pair: false
    }
  },
  {
    name: 'открытая пара в прошлом дне: игнорируется, флаг выставлен',
    events: day(['08:00:00', 'entry'], ['12:00:00', 'exit'], ['13:00:00', 'entry']),
    expected: {
      events_count: 3, exits_count: 0, outside_minutes: 0, presence_minutes: 240,
      first_entry: '08:00:00', last_exit: '12:00:00', has_open_pair: true
    }
  },
  {
    name: 'открытая пара сегодня (сейчас 15:00:00): закрывается текущим временем',
    events: day(['08:00:00', 'entry'], ['12:00:00', 'exit'], ['13:00:00', 'entry']),
    nowSeconds: 15 * 3600,
    expected: {
      events_count: 3, exits_count: 1, outside_minutes: 60, presence_minutes: 360,
      first_entry: '08:00:00', last_exit: '12:00:00', has_open_pair: true
    }
  },
  {
    name: 'пустой день',
    events: [],
    expected: {
      events_count: 0, exits_count: 0, outside_minutes: 0, presence_minutes: 0,
      first_entry: null, last_exit: null, has_open_pair: false
    }
  }
]

for (const { name, events, nowSeconds = null, expected } of cases) {
  // порядок событий на входе не должен влиять на результат
  const shuffled = [...events].reverse()
  assert.deepEqual(calculateSkudDayStats(events, nowSeconds), expected, name)
  assert.deepEqual(calculateSkudDayStats(shuffled, nowSeconds), expected, `${name} (обратный порядок)`)
  console.log(`ok: ${name}`)
}
console.log(`Пройдено: ${cases.length}`)
