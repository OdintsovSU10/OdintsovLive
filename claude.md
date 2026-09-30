# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal portal built with React + TypeScript + Vite + Supabase.

## Commands

- `npm run dev` — Development server
- `npm run build` — Production build (TypeScript check + Vite)
- `npm run preview` — Preview production build

## Architecture

```
src/
  App.tsx              # Root: auth state, theme, routing
  lib/supabase.ts      # Supabase client
  components/          # Reusable UI (Logo, Sidebar, Calendar)
  pages/               # Route pages (Home, Work, Body, Admin)
```

**Auth flow**: App.tsx checks session → unapproved users see pending screen → approved users get full app.

**Routes**: `/`, `/calendar`, `/salary`, `/salary/:year/:month`, `/vacation-rate`, `/rent`, `/rent/:year/:month`, `/body/weight`, `/body/params`, `/car`, `/tender`, `/tender/admin` (admin only), `/admin` (admin only)

## Database (Supabase)

**Схема**: `supabase/schemas/prod.sql`

Основные таблицы:
- `profiles` — пользователи (approved, is_admin)
- `calendar_days` — дни календаря (date, status)
- `salary_settings` — настройки зарплаты по месяцам
- `salary_calculations` — расчёты зарплаты
- `rent_records` — аренда по месяцам: суммы, показания, тарифы воды
- `meter_ocr_jobs` — очередь распознавания фото счётчиков (воркер на home: `ops/meter-ocr-worker/`)

RLS отключен (персональный проект).

## MVP

- Всегда делай минимально работающую версию
- Не добавляй фичи "на будущее"
- Сначала работает — потом улучшаем

## КРАТКОСТЬ

- Отвечай максимально сжато. Без пояснений и предисловий.
- Если запрашивают код — выводи только рабочие фрагменты кода в блоках, без текста.
- Изменения выдавай как *минимальный diff/patch* или как *конкретные вставки*.
- Не перечисляй, «что было сделано», если прямо не попросили.
- Если нужен текст — не более 5 пунктов, каждый ≤ 12 слов.

## UI/UX

- Темы: светлая + тёмная одновременно
- Breakpoints: Desktop 900px, Tablet 768px, Mobile 430px
- CSS-переменные для цветов (см. `Branding.md`)
- Иконки: Lucide (outline, 1.5px stroke)

## Git

- Коммиты на русском, кратко (1-2 предложения)
- Без приписок "Generated with Claude Code" и "Co-Authored-By"

## Ограничения

- Максимум 600 строк кода в одном ответе
- SQL без русских комментариев в блоках кода
