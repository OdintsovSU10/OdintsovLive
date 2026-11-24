// Разовый вход аккаунтом Telegram для чтения каналов без веб-просмотра (см. tgUser.mjs).
// Запуск: docker exec -it odintsovlive-bot node tgLogin.mjs [--data-dir <папка>]
// Папка данных — как у бота: DATA_DIR или ./data рядом с этим файлом. Строку сессии и api_hash не печатаем.
import path from 'node:path'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { newClient, saveTgUser, tgUserFile } from './tgUser.mjs'

const argDir = () => {
  const index = process.argv.indexOf('--data-dir')
  return index > 0 ? process.argv[index + 1] : undefined
}

const dataDir = path.resolve(argDir() || process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data'))

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
let muted = false
const writeToOutput = rl._writeToOutput?.bind(rl)
rl._writeToOutput = text => {
  // пока вводится секрет — символы на экран не выводим (перевод строки пропускаем)
  if (!muted || text.includes('\n') || text.includes('\r')) writeToOutput?.(text)
}

const ask = async (question, { secret = false } = {}) => {
  process.stdout.write(question)
  muted = secret
  try {
    return (await rl.question('')).trim()
  } finally {
    if (secret) process.stdout.write('\n')
    muted = false
  }
}

const main = async () => {
  console.log('Вход аккаунтом Telegram для чтения закрытых для веба каналов.')
  console.log('api_id и api_hash: https://my.telegram.org → API development tools\n')
  const apiId = Number(await ask('api_id: '))
  if (!Number.isInteger(apiId) || apiId <= 0) throw new Error('api_id — целое число')
  const apiHash = await ask('api_hash: ', { secret: true })
  if (!apiHash) throw new Error('api_hash пустой')
  const phoneNumber = await ask('Телефон (+7…): ')

  const client = await newClient({ apiId, apiHash, session: '' })
  try {
    await client.start({
      phoneNumber: async () => phoneNumber,
      phoneCode: async () => ask('Код из Telegram: '),
      password: async hint => ask(`Пароль двухэтапной проверки${hint ? ` (подсказка: ${hint})` : ''}: `, { secret: true }),
      onError: async err => {
        console.error('Ошибка входа:', err.errorMessage || err.message || err)
        // true — остановить попытки
        return true
      }
    })
    const me = await client.getMe()
    saveTgUser(dataDir, { apiId, apiHash, session: client.session.save() })
    console.log(`Готово: вход как ${me.firstName || 'без имени'}${me.username ? ` (@${me.username})` : ''}. Перезапускать бота не нужно — подхватится на следующем сборе.`)
    console.log(`Файл: ${tgUserFile(dataDir)}`)
  } finally {
    await client.disconnect().catch(() => {})
  }
}

try {
  await main()
  process.exit(0)
} catch (err) {
  console.error(err.message || err)
  process.exit(1)
}
