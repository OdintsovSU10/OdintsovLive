// Тест расчёта дня СКУД: node scripts/sync-fot-timesheet.skud.test.mjs
// Ожидаемые значения сверены с calculateFotSkudDay (src/pages/tender/utils/skudTimeCalculation.ts).
import assert from 'node:assert/strict'

process.env.FOT_SYNC_NO_MAIN = '1'
const { calculateSkudDayStats } = await import('./sync-fot-timesheet.mjs')

let counter = 0
// Событие: [время, направление, точка, внутренняя?]
const day = (...items) => items.map(([time, direction, accessPoint = 'A', isInternal]) => {
  counter += 1
  return isInternal === undefined
    ? { id: `e${counter}`, time, accessPoint, direction }
    : { id: `e${counter}`, time, accessPoint, direction, isInternal }
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
    name: 'внутренние точки (коридор) игнорируются: нет выходов и «вне офиса»',
    events: day(
      ['08:05:00', 'entry', 'Офис', false],
      ['08:08:00', 'entry', 'Коридор', true], ['08:12:00', 'exit', 'Коридор', true],
      ['09:32:00', 'entry', 'Коридор', true],
      ['11:34:00', 'entry', 'Коридор', true], ['11:40:00', 'exit', 'Коридор', true],
      ['12:38:00', 'entry', 'Коридор', true], ['12:43:00', 'exit', 'Коридор', true],
      ['15:50:00', 'entry', 'Коридор', true], ['15:57:00', 'exit', 'Коридор', true],
      ['16:13:00', 'exit', 'Офис', false]
    ),
    expected: {
      events_count: 2, exits_count: 0, outside_minutes: 0, presence_minutes: 488,
      first_entry: '08:05:00', last_exit: '16:13:00', has_open_pair: false
    }
  },
  {
    name: 'только внутренние события: день пустой',
    events: day(['08:00:00', 'entry', 'Коридор', true], ['09:00:00', 'exit', 'Коридор', true]),
    expected: {
      events_count: 0, exits_count: 0, outside_minutes: 0, presence_minutes: 0,
      first_entry: null, last_exit: null, has_open_pair: false
    }
  },
  {
    name: 'внутренний вход не открывает пару и не заменяет внешний вход',
    events: day(
      ['08:00:00', 'entry', 'Офис', false], ['08:30:00', 'entry', 'Офис', true],
      ['12:00:00', 'exit', 'Офис', false]
    ),
    expected: {
      events_count: 2, exits_count: 0, outside_minutes: 0, presence_minutes: 240,
      first_entry: '08:00:00', last_exit: '12:00:00', has_open_pair: false
    }
  },
  {
    name: 'is_internal: false явно — как событие без поля',
    events: day(['08:00:00', 'entry', 'A', false], ['17:00:00', 'exit', 'A', false]),
    expected: {
      events_count: 2, exits_count: 0, outside_minutes: 0, presence_minutes: 540,
      first_entry: '08:00:00', last_exit: '17:00:00', has_open_pair: false
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
