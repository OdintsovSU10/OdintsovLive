# Tender + SKUD Bundle

Самостоятельный бандл модулей «Тендерное управление» и «СКУД» для переноса на новый портал.

## Структура

```
src/
  pages/tender/     — Тендерное управление (24 файла)
  pages/skud/       — СКУД (4 файла)
  lib/              — Общие утилиты (4 файла)
supabase/
  migrations/       — Оригинальные миграции (9 файлов)
  combined_schema.sql — Объединённая схема (для чистой установки)
```

## npm-зависимости

```bash
npm install @supabase/supabase-js xlsx recharts lucide-react
```

## Env-переменные

```
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=<your-supabase-anon-key>
```

## Роутинг

```tsx
import { lazy, Suspense } from 'react'
import { Route, Navigate } from 'react-router-dom'

const TenderPage = lazy(() => import('./pages/tender'))
const AdminTenderPage = lazy(() => import('./pages/tender/AdminTenderPage'))
const SKUDPage = lazy(() => import('./pages/skud'))

// В Router:
<Route path="/tender" element={<TenderPage />} />
<Route path="/tender/admin" element={
  profile?.is_admin ? <AdminTenderPage /> : <Navigate to="/tender" replace />
} />
<Route path="/skud" element={<SKUDPage />} />
```

## База данных

Для чистой установки выполнить `supabase/combined_schema.sql`.

11 таблиц: `tender_employees`, `tender_salary_history`, `tender_timesheet`, `tender_timesheet_stats`, `tender_imports`, `tender_position_history`, `tender_salary_calculations`, `tender_subdivisions`, `tender_employee_events`, `skud_events`, `skud_daily_summary`.

2 RPC-функции: `archive_tender_employee`, `restore_tender_employee`.

## localStorage

- `fot_base_transport` — базовая транспортная выплата
- `fot_extra_bonuses_${year}_${month}` — доп. бонусы по сотрудникам

## Импорты файлов

Все пути из `pages/tender/` и `pages/skud/` ссылаются на `../../lib/` — структура бандла сохраняет эти пути.
