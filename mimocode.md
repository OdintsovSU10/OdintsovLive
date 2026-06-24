# MiMoCode.md

cd /Users/odintsovlive/Desktop/Project/OdintsovLive
mimo

Персональный портал **Odintsov Live** — React + TypeScript + Vite + Supabase (self-hosted).

## Commands

| Команда | Действие |
|---------|----------|
| `npm run dev` | Dev-сервер (Vite + proxy → odintsovlive.fvds.ru) |
| `npm run build` | TypeScript check + production build |
| `npm run preview` | Preview production build |
| `./deploy.sh` | Сборка → tar → ssh → /var/www/odintsovlive |

## Architecture

```
src/
├── App.tsx                    # Root: auth, theme, routing, idle screen, fonts
├── main.tsx                   # React entry (StrictMode)
├── index.css                  # CSS variables, themes (light/dark/tender), reset
├── App.css                    # Layout, loading, pending screen styles
├── lib/
│   ├── supabase.ts            # Supabase client singleton
│   ├── constants.ts           # MONTHS, WEEKDAYS, YEARS, HOLIDAYS
│   ├── dateUtils.ts           # isWeekend, isHoliday, calcAge, calcTenure
│   ├── formatUtils.ts         # formatMoney, formatNumber, parseNumber
│   └── workNorms.ts           # Work days norm per year/month
├── hooks/
│   └── useMoscowDateTime.ts   # Moscow timezone clock (1s interval)
├── components/
│   ├── Logo.tsx               # SVG logo + text
│   ├── Sidebar.tsx + .css     # Nav sidebar (mobile swipe, collapsible, clock, theme)
│   ├── Calendar.tsx + .css    # Full-year calendar, day status cycling, Supabase sync
│   ├── WeatherWidget.tsx      # OpenWeatherMap multi-city widget (15min cache)
│   ├── ConfirmModal.tsx       # Reusable delete confirmation dialog
│   └── notes/                 # Rich text editor (contentEditable, auto-save, markdown)
└── pages/
    ├── AuthPage.tsx           # Login/register (Supabase Auth)
    ├── HomePage.tsx           # Dashboard: weather, clock, quick links
    ├── CalendarPage.tsx       # Thin wrapper → Calendar component
    ├── NotesPage.tsx          # Notes CRUD with rich editor
    ├── salary/                # Salary overview + monthly detail
    ├── expenses/              # Financial dashboard (overview/transactions/analytics)
    ├── car/                   # Multi-car management (5 tabs)
    ├── tender/                # HR/tender (dashboard/timesheet/FOT + admin)
    ├── RentPage.tsx           # Rent/utilities tracking
    ├── WeightPage.tsx         # Weight tracker with chart
    ├── BodyParamsPage.tsx     # Body measurements (12 params)
    ├── VacationRatePage.tsx   # Vacation pay calculator
    └── AdminPage.tsx          # User approval + visual settings (fonts)
```

### Auth Flow

`App.tsx` → `supabase.auth.getSession()` → 3 состояния:
1. `loading` → spinner
2. `!user` → `<AuthPage>` (login/register)
3. `user && !profile.approved` → "Ожидание одобрения" + logout
4. `user && profile.approved` → full app (Sidebar + Routes)

Профиль загружается из `profiles` (approved, is_admin). Шрифты из `user_settings`.

### State Management

- **Нет внешних библиотек** (ни Redux, ни Context)
- `useState` + прямые вызовы Supabase в `useEffect`
- Custom hooks для сложных фичей: `useSalaryData`, `useCarData`, `useTenderData`, `useExpensesData`
- `localStorage` для кэша (calendar days, weather, theme, tender transport)
- Optimistic updates после Supabase writes

### Feature-Based Structure

Каждая сложная фича — отдельная директория с co-located:
- `hooks/` — data fetching + state
- `utils/` — pure functions
- `types.ts` — TypeScript interfaces
- `components/` — feature-specific sub-components
- `index.ts` — barrel re-export

## Routes

| Path | Component | Access |
|------|-----------|--------|
| `/` | HomePage | approved |
| `/notes` | NotesPage | approved |
| `/calendar` | CalendarPage | approved |
| `/salary` | SalaryPage | approved |
| `/salary/:year/:month` | SalaryMonthPage | approved |
| `/vacation-rate` | VacationRatePage | approved |
| `/rent` | RentPage | approved |
| `/rent/:year/:month` | RentMonthPage | approved |
| `/expenses` | ExpensesPage | approved |
| `/body/weight` | WeightPage | approved |
| `/body/params` | BodyParamsPage | approved |
| `/car` | CarPage | approved |
| `/tender` | TenderPage | approved |
| `/tender/admin` | AdminTenderPage | admin only |
| `/admin` | AdminPage | admin only |

Все страницы кроме HomePage и AuthPage — `React.lazy()` с `<Suspense>`.

## Database (Supabase)

**Схема**: `supabase/schemas/prod.sql` (~1500 строк)
**Миграции**: `supabase/migrations/` (15 файлов: 001-010 + named)

### Tables

| Table | Purpose |
|-------|---------|
| `profiles` | Пользователи (approved, is_admin) |
| `user_settings` | Настройки шрифтов |
| `calendar_days` | Дни календаря (date, status: work/worked/vacation) |
| `salary_settings` | Настройки зарплаты по месяцам |
| `salary_payments` | Платежи по зарплате |
| `rent_records` | Аренда/ЖКХ по месяцам |
| `notes` | Заметки (title, content, is_pinned) |
| `body_weight` | Вес (date, weight) |
| `body_params` | Параметры тела (12 измерений) |
| `cars` | Автомобили |
| `car_maintenance` | Обслуживание |
| `car_fuel` | Заправки |
| `car_expenses` | Расходы на авто |
| `car_parts` | Каталог запчастей |
| `car_calendar_events` | События авто |
| `tender_employees` | Сотрудники (HR) |
| `tender_timesheet` | Табель |
| `tender_salary_history` | История зарплат |
| `tender_salary_calculations` | Расчёты зарплаты |
| `tender_timesheet_stats` | Статистика табеля |
| `tender_subdivisions` | Подразделения |
| `tender_employee_events` | Архив/восстановление |
| `tender_imports` | Журнал импорта |
| `skud_events` | Сырые события СКУД |
| `skud_daily_summary` | Суточные данные СКУД |
| `expense_transactions` | Транзакции расходов |
| `expense_import_batches` | Пакеты импорта |
| `expense_user_categories` | Пользовательские категории |
| `expense_category_mappings` | Маппинг банковских → пользовательских категорий |

### Views

- `salary_calculations` — агрегация calendar_days в work/worked/vacation по месяцам
- `vacation_rate` — дневная ставка отпускных (12-месячное скользящее окно)

### Functions & Triggers

- `handle_new_user()` — триггер на INSERT в auth.users → создаёт profile
- `update_updated_at()` — авто-update поля updated_at
- `archive_tender_employee()` / `restore_tender_employee()` — жизненный цикл сотрудников

### Key Facts

- **RLS отключен** (персональный проект)
- **PostgreSQL 15** via Docker (`supabase/postgres:15.1.1.78`)
- **Port 5433**, socket `/var/run/postgresql`
- Все запросы: `supabase.auth.getUser()` → `eq('user_id', user.id)`

## Infrastructure

| Параметр | Значение |
|----------|----------|
| VDS | FirstVDS, 80.74.28.233 |
| SSH | port 22, user root, alias `vds` |
| Domain | odintsovlive.fvds.ru |
| Frontend path | /var/www/odintsovlive |
| Supabase path | /opt/supabase |
| PostgreSQL port | 5433 |
| Nginx config | /etc/nginx/sites-available/odintsovlive |
| SSL | Let's Encrypt (certbot) |

### Supabase Stack (Docker Compose)

- `supabase-db` — PostgreSQL 15
- `supabase-auth` — GoTrue v2.143.0
- `supabase-rest` — PostgREST v12.0.1
- `supabase-kong` — Kong 2.8.1 (API gateway)

### Deploy Flow

```bash
./deploy.sh
# 1. npm run build
# 2. tar dist/ → ssh upload to /var/www/odintsovlive
# 3. verify file count
```

### DB Migration Flow

```bash
# 1. Copy SQL to VDS
scp supabase/migrations/XXX.sql root@80.74.28.233:/tmp/
# 2. Apply via docker exec
ssh root@80.74.28.233 "docker exec -i supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres < /tmp/XXX.sql"
```

## Design System

### Themes

3 CSS-темы через `data-theme` / `data-route-theme` атрибуты на `<html>`:

| Theme | Attribute | Palette |
|-------|-----------|---------|
| Light | `data-theme="light"` | bg #F8F6F3, text #1A1A1A, accent #C4A77D |
| Dark | `data-theme="dark"` | bg #0F0F0F, text #F5F5F5, accent #C4A77D |
| Tender | `data-route-theme="tender"` | bg #080E1A, text #E2E8F0, primary #818CF8 |

### CSS Variables

Все цвета, тени, радиусы, переходы — через CSS custom properties в `index.css`.
Компоненты **не используют** хардкод цветов — только `var(--xxx)`.

### Typography

| Role | Font | Weights |
|------|------|---------|
| Headlines | Cormorant Garamond | 400, 500, 600 |
| Body | DM Sans | 300, 400, 500, 600 |
| Monospace | DM Mono | 400 |

Динамическая загрузка через Google Fonts + поддержка кастомных шрифтов (Supabase Storage).

### Breakpoints

- Desktop: 900px+
- Tablet: 768px
- Mobile: 430px

### Icons

Lucide React, outline style, `strokeWidth={1.5}`, размер 20px (default) / 24px (large).

### Charts

Recharts (AreaChart, BarChart, PieChart) с CSS variable colors.

## Code Conventions

### TypeScript

- `interface` > `type` для data shapes
- `as const` для константных массивов
- `{ [key: string]: number }` для month-indexed данных
- Barrel exports (`index.ts`) в каждой feature directory
- `React.lazy()` для всех страниц кроме HomePage/AuthPage

### React

- `useCallback` для стабильных ссылок на data-loading функции
- `useMemo` для derived data (filtering, sorting, grouping)
- `useState` + `useEffect` для data fetching (НЕ route loaders)
- Нет React Context — всё через props

### CSS

- Co-located `.css` файлы рядом с компонентами
- CSS custom properties для всех цветов
- Нет Tailwind, нет CSS-in-JS, нет CSS modules
- `toLocaleString('ru-RU')` для форматирования чисел

### Data Fetching Pattern

```typescript
const loadData = useCallback(async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { data } = await supabase
    .from('table')
    .select('*')
    .eq('user_id', user.id)
  // setState
}, [])
```

### Supabase Client

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
export const supabase = createClient(supabaseUrl, supabaseKey)
```

## Rules

### КРАТКОСТЬ

- Отвечай максимально сжато. Без пояснений и предисловий.
- Если запрашивают код — выводи только рабочие фрагменты в блоках, без текста.
- Изменения выдавай как *минимальный diff/patch* или как *конкретные вставки*.
- Не перечисляй, «что было сделано», если прямо не попросили.
- Если нужен текст — не более 5 пунктов, каждый ≤ 12 слов.

### MVP

- Всегда делай минимально работающую версию.
- Не добавляй фичи "на будущее".
- Сначала работает — потом улучшаем.

### Git

- Коммиты на русском, кратко (1-2 предложения).
- Без приписок "Generated with" и "Co-Authored-By".

### Ограничения

- Максимум 600 строк кода в одном ответе.
- SQL без русских комментариев в блоках кода.

## Key Files Reference

| Файл | Назначение |
|------|------------|
| `src/App.tsx` | Root: auth, theme, routing, fonts, idle mode |
| `src/index.css` | CSS variables, themes, global reset |
| `src/lib/supabase.ts` | Supabase client singleton |
| `src/lib/constants.ts` | MONTHS, WEEKDAYS, YEARS, HOLIDAYS |
| `src/lib/workNorms.ts` | Work days norm 2025-2026 |
| `src/components/Sidebar.tsx` | Navigation sidebar |
| `src/pages/tender/TenderPage.tsx` | Main tender page (~1500 lines) |
| `src/pages/tender/AdminTenderPage.tsx` | Tender admin (~1500+ lines) |
| `src/pages/expenses/ExpensesPage.tsx` | Financial dashboard |
| `src/pages/salary/SalaryPage.tsx` | Salary overview |
| `src/pages/car/CarPage.tsx` | Multi-car management |
| `supabase/schemas/prod.sql` | Full DB schema |
| `supabase/migrations/` | SQL migrations (001-010 + named) |
| `docker/supabase/docker-compose.yml` | Supabase Docker stack |
| `deploy.sh` | Deploy script |
| `DEPLOY.md` | Deployment docs |
| `DATABASE.md` | DB admin commands |
| `Branding.md` | Design system spec |
| `vite.config.ts` | Vite config + API proxy |
