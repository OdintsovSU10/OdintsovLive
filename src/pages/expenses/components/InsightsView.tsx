import { useMemo } from 'react'
import { CalendarClock, Coffee, EyeOff, PiggyBank, Receipt, Repeat, ShoppingBag, Wallet } from 'lucide-react'
import type { ExpenseInsights, FindingKind, SubscriptionPeriod } from '../types'
import { SAVINGS_CUT_PERCENT } from '../utils/analysis'
import { formatAmount, formatDate, formatRub } from '../utils/format'
import { InsightList, type InsightRow, type InsightTone } from './InsightList'

const ICON_PROPS = { size: 18, strokeWidth: 1.5 }

const PERIOD_LABEL: Record<SubscriptionPeriod, string> = {
  weekly: 'еженедельно',
  monthly: 'ежемесячно',
  quarterly: 'раз в квартал',
  irregular: 'нерегулярно'
}

const FINDING_META: Record<FindingKind, { badge: string; tone: InsightTone; hint: string }> = {
  duplicate: { badge: 'Возможный дубль', tone: 'danger', hint: 'та же сумма дважды за 10 минут' },
  micro: { badge: 'Микросписание', tone: 'warning', hint: 'мелкие суммы от сервиса: платные опции, привязка карты' },
  intermediary: { badge: 'Посредник', tone: 'warning', hint: 'платёжный агент — за ним может скрываться подписка' },
  tips: { badge: 'Чаевые', tone: 'info', hint: 'чаевые через сервис' },
  insurance: { badge: 'Страховка / комиссия', tone: 'warning', hint: 'проверьте, не подключена ли без спроса' },
  failed: { badge: 'Отклонено', tone: 'muted', hint: 'банк не провёл — деньги не списаны' }
}

const money = (value: number) => formatRub(value, Number.isInteger(value) ? 0 : 2)
const dateRange = (from: string, to: string) => (from === to ? formatDate(from) : `${formatDate(from)} — ${formatDate(to)}`)

interface Props {
  insights: ExpenseInsights | null
  loading: boolean
}

export function InsightsView({ insights, loading }: Props) {
  const rows = useMemo(() => {
    if (!insights) return null

    const subscriptions: InsightRow[] = insights.subscriptions.map(item => ({
      key: item.key,
      title: item.name,
      badge: item.active ? PERIOD_LABEL[item.period] : 'похоже, отменена',
      tone: item.active ? 'info' : 'muted',
      muted: !item.active,
      meta: [
        item.category,
        `${item.count} списаний`,
        `последнее ${formatDate(item.lastDate)}`,
        item.active && item.nextDate ? `следующее ~${formatDate(item.nextDate)}` : null
      ].filter(Boolean).join(' · '),
      value: money(item.amount),
      valueHint: `${formatRub(item.monthlyCost)}/мес · ${formatRub(item.yearlyCost)}/год`
    }))

    const findings: InsightRow[] = insights.findings.map(item => {
      const meta = FINDING_META[item.kind]
      return {
        key: item.key,
        title: item.name,
        badge: meta.badge,
        tone: meta.tone,
        muted: item.kind === 'failed',
        meta: `${meta.hint} · ${item.count} оп. · ${dateRange(item.firstDate, item.lastDate)}`,
        value: money(item.total)
      }
    })

    const maxShare = Math.max(...insights.discretionary.map(item => item.share), 0)
    const discretionary: InsightRow[] = insights.discretionary.map(item => ({
      key: item.key,
      title: item.name,
      meta: `${item.count} покупок · средний чек ${formatRub(item.avgCheck)} · ${(item.share * 100).toFixed(1)}% покупок`,
      value: `${formatRub(item.monthly)}/мес`,
      valueHint: `−${SAVINGS_CUT_PERCENT}% = ${formatRub(item.monthly * (SAVINGS_CUT_PERCENT / 100))}/мес`,
      share: maxShare > 0 ? item.share / maxShare : 0
    }))

    const habits: InsightRow[] = insights.habits.map(item => ({
      key: item.key,
      title: item.name,
      meta: [
        item.category,
        `${item.count} раз`,
        `${formatAmount(item.perWeek, 1)} в неделю`,
        `средний чек ${formatRub(item.avgCheck)}`
      ].filter(Boolean).join(' · '),
      value: `${formatRub(item.monthly)}/мес`,
      valueHint: `${formatRub(item.total)} за период`
    }))

    const large: InsightRow[] = insights.largePurchases.map(item => ({
      key: item.id,
      title: item.name,
      meta: [formatDate(item.date), item.category].filter(Boolean).join(' · '),
      value: money(item.amount)
    }))

    return { subscriptions, findings, discretionary, habits, large }
  }, [insights])

  if (!insights || !rows) {
    return (
      <section className="section-card">
        <div className="empty-state">{loading ? 'Загрузка...' : 'Импортируйте выписку, чтобы получить разбор трат'}</div>
      </section>
    )
  }

  const activeSubscriptions = insights.subscriptions.filter(item => item.active).length

  return (
    <>
      <section className="section-card insights-summary">
        <div className="section-header">
          <h3>Разбор трат</h3>
          <span className="table-meta">{dateRange(insights.windowFrom, insights.windowTo)}</span>
        </div>

        <div className="summary-grid">
          <div className="summary-item">
            <Wallet {...ICON_PROPS} />
            <span>Покупки</span>
            <strong>{formatRub(insights.purchasesMonthly)}/мес</strong>
          </div>
          <div className="summary-item">
            <Repeat {...ICON_PROPS} />
            <span>Подписки ({activeSubscriptions})</span>
            <strong>{formatRub(insights.subscriptionsMonthly)}/мес</strong>
          </div>
          <div className="summary-item warning">
            <EyeOff {...ICON_PROPS} />
            <span>Подозрительные списания</span>
            <strong>{formatRub(insights.suspiciousTotal)}</strong>
          </div>
          <div className="summary-item accent">
            <PiggyBank {...ICON_PROPS} />
            <span>Можно сэкономить</span>
            <strong>до {formatRub(insights.potentialMonthlySavings)}/мес</strong>
          </div>
        </div>

        <p className="insight-note">
          Экономия = {SAVINGS_CUT_PERCENT}% необязательных трат + подозрительные списания.
          Последние 180 дней с данными; переводы людям не считаются покупками.
          Не учтены: {insights.internalCount} переводов между своими счетами, {insights.failedCount} отклонённых операций.
        </p>
      </section>

      <InsightList
        title="Подписки и регулярные платежи"
        icon={<Repeat {...ICON_PROPS} />}
        description="Повторяющиеся списания одной суммы. Отключите то, чем не пользуетесь."
        rows={rows.subscriptions}
        emptyText="Регулярных списаний не найдено"
      />

      <InsightList
        title="Скрытые и подозрительные списания"
        icon={<EyeOff {...ICON_PROPS} />}
        description="Дубли, мелкие списания сервисов, платёжные посредники, страховки."
        rows={rows.findings}
        emptyText="Ничего подозрительного"
        footer={insights.roundUpTotal > 0 && (
          <>
            Округления в копилку: <strong>{money(insights.roundUpTotal)}</strong> за период
            (~{formatRub(insights.roundUpTotal / insights.months)}/мес) — не тратятся, но незаметно уходят со счёта.
          </>
        )}
      />

      <InsightList
        title="Необязательные траты"
        icon={<ShoppingBag {...ICON_PROPS} />}
        description={`Фастфуд, доставка, алкоголь, такси, маркетплейсы, цветы — ${formatRub(insights.discretionaryMonthly)}/мес.`}
        rows={rows.discretionary}
        emptyText="Необязательных трат не найдено"
      />

      <InsightList
        title="Частые мелкие покупки"
        icon={<Coffee {...ICON_PROPS} />}
        description="Места, куда вы ходите чаще всего: мелкие чеки складываются в заметную сумму."
        rows={rows.habits}
        emptyText="Частых покупок не найдено"
      />

      <InsightList
        title="Крупные разовые траты"
        icon={<Receipt {...ICON_PROPS} />}
        description="Покупки от 10 000 ₽, заметно выше обычного чека категории."
        rows={rows.large}
        emptyText="Крупных покупок не найдено"
        footer={
          <span className="with-icon">
            <CalendarClock size={14} strokeWidth={1.5} />
            Проверьте, были ли они запланированы.
          </span>
        }
      />
    </>
  )
}
