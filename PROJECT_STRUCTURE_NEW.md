# PROJECT_STRUCTURE.md

Полная файловая структура проекта **Odintsov Live**.

## Root

```
.claude/
├── agents/
│   ├── backend-architect.md
│   ├── context-manager.md
│   ├── database-optimizer.md
│   ├── debugger.md
│   ├── docs-architect.md
│   ├── frontend-developer.md
│   ├── sql-pro.md
│   ├── typescript-pro.md
│   └── ui-ux-designer.md
└── settings.local.json

.mimocode/
└── plans/

Logo/
docker/
├── frontend/
│   ├── docker-compose.yml
│   └── nginx.conf
└── supabase/
    ├── .env.example
    ├── docker-compose.yml
    ├── generate-keys.sh
    ├── init-public-tables.sql
    └── kong.yml

public/
├── favicon.svg
└── fonts/
    ├── SocialGothicSoft.woff
    └── SocialGothicSoft.woff2

scripts/
├── apply-timesheet-migration.sh
├── check-db.sh
├── grant-timesheet-permissions.sh
├── swap-water-values.sql
└── update-timesheet-constraint.sh

supabase/
├── exports/
│   ├── enums.json
│   ├── functions.json
│   ├── indexes.json
│   ├── roles.json
│   ├── tables.json
│   ├── triggers.json
│   └── views.json
├── migrations/
│   ├── 001_tender_timesheet.sql
│   ├── 002_add_absent_status.sql
│   ├── 003_cascade_delete_tender.sql
│   ├── 004_skud_system.sql
│   ├── 005_employee_management.sql
│   ├── 006_fix_tender_employees.sql
│   ├── 006_salary_history.sql
│   ├── 007_timesheet_stats.sql
│   ├── 008_monthly_bonus.sql
│   ├── 009_subdivisions_and_employee_events.sql
│   ├── 010_expense_tracking.sql
│   ├── body_tables.sql
│   ├── create_car_tables.sql
│   ├── create_notes_table.sql
│   └── prod.sql
└── schemas/
    └── prod.sql

tender-bundle/
├── README.md
├── src/
│   ├── lib/
│   │   ├── constants.ts
│   │   ├── formatUtils.ts
│   │   ├── supabase.ts
│   │   └── workNorms.ts
│   └── pages/
│       ├── skud/
│       │   ├── SKUDPage.css
│       │   ├── SKUDPage.tsx
│       │   ├── index.ts
│       │   └── types.ts
│       └── tender/
│           ├── AdminTenderPage.css
│           ├── AdminTenderPage.tsx
│           ├── TenderPage.css
│           ├── TenderPage.tsx
│           ├── index.ts
│           ├── types.ts
│           ├── components/
│           │   ├── DashboardOverview.css
│           │   ├── DashboardOverview.tsx
│           │   ├── DepartmentFOT.css
│           │   ├── DepartmentFOT.tsx
│           │   ├── ImportEmployeesModal.tsx
│           │   ├── ImportModal.css
│           │   ├── ImportSalaryHistoryModal.tsx
│           │   ├── ImportTimesheetModal.tsx
│           │   ├── SalaryChart.tsx
│           │   ├── TimesheetGrid.css
│           │   └── TimesheetGrid.tsx
│           ├── hooks/
│           │   ├── useEmployeeImport.ts
│           │   ├── useSalaryHistoryImport.ts
│           │   ├── useTenderData.ts
│           │   └── useTimesheetImport.ts
│           └── utils/
│               ├── excelParser.ts
│               ├── salaryCalculator.ts
│               └── tenderPresentation.ts
└── supabase/
    ├── combined_schema.sql
    └── migrations/
        └── (001-009 copies)

src/
├── App.css
├── App.tsx
├── index.css
├── main.tsx
├── vite-env.d.ts
├── lib/
│   ├── constants.ts
│   ├── dateUtils.ts
│   ├── formatUtils.ts
│   ├── supabase.ts
│   └── workNorms.ts
├── hooks/
│   └── useMoscowDateTime.ts
├── components/
│   ├── Calendar.css
│   ├── Calendar.tsx
│   ├── ConfirmModal.tsx
│   ├── Logo.tsx
│   ├── Sidebar.css
│   ├── Sidebar.tsx
│   ├── WeatherWidget.css
│   └── WeatherWidget.tsx

Config & Docs:
├── .editorconfig
├── .gitignore
├── Branding.md
├── DATABASE.md
├── DEPLOY.md
├── claude.md
├── deploy.sh
├── index.html
├── mimocode.md
├── package.json
├── package-lock.json
├── tender-bundle.zip
└── tsconfig.json

```

## Статистика

| Что | Кол-во |
|-----|--------|
| Фичей (pages) | 10 (auth, home, notes, calendar, salary, expenses, car, tender, rent, body, vacation, admin) |
| Таблиц БД | 25+ |
| Миграций | 15 |
| Docker-сервисов | 4 (db, auth, rest, kong) |
| npm-зависимостей | 6 prod, 5 dev |
| CSS-тем | 3 (light, dark, tender) |
| Claude agents | 9 |

## Архитектура

**SPA на React + Vite** с роутингом через `react-router-dom`. Приложение состоит из:
- **`src/pages/`** — основные страницы приложения
- **`src/components/`** — общие компоненты (Sidebar, Calendar, WeatherWidget)
- **`src/hooks/`** — кастомные хуки
- **`src/lib/`** — утилиты и константы

**Backend на Supabase** (PostgreSQL + Auth + Storage). Все данные хранятся в облаке, фронтенд общается через клиентскую библиотеку `@supabase/supabase-js`.

**Docker-развёртывание**:
- Frontend: nginx + Vite build
- Backend: Supabase stack (db, auth, rest, kong) на отдельном сервере
