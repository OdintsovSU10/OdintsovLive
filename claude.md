# Odintsov Live

## Project Overview

Personal project built with React, TypeScript, and Vite.

## Tech Stack

- **Framework**: React 18
- **Language**: TypeScript 5.6
- **Build Tool**: Vite 6
- **Package Manager**: npm

## Project Structure

```
src/
  App.tsx       # Main application component
  App.css       # Application styles
  main.tsx      # Entry point
  index.css     # Global styles
```

## Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production (runs TypeScript check first)
- `npm run preview` - Preview production build

## Code Style

- Use functional components with hooks
- Strict TypeScript: no unused locals/parameters
- CSS modules or plain CSS files for styling

## Development Guidelines

- Keep components small and focused
- Use TypeScript strict mode
- Follow React best practices for hooks and state management

## КРАТКОСТЬ

- Отвечай максимально сжато. Без пояснений и предисловий.
- Если запрашивают код — выводи только рабочие фрагменты кода в блоках, без текста.
- Изменения выдавай как *минимальный diff/patch* или как *конкретные вставки*.
- Не перечисляй, «что было сделано», если прямо не попросили.
- Если нужен текст — не более 5 пунктов, каждый ≤ 12 слов.

## UI/UX Requirements

- **Темы**: Всегда реализовывать светлую и тёмную тему одновременно
- **Адаптивность**: Responsive design для desktop и mobile
  - Desktop: max-width 900px, 6-колоночные сетки
  - Tablet (768px): 3-колоночные сетки
  - Mobile (430px): 2-колоночные сетки, скрывать второстепенные элементы
- Использовать CSS-переменные для цветов
- **Branding**: См. `Branding.md` — цвета, тени, радиусы, иконки (Lucide)

## Database (Supabase)

- **Схема БД**: `supabase/schemas/prod.sql` — основной файл для понимания структуры БД
- **RLS**: Всегда отключен (проект персональный)
- SQL без комментариев на русском в блоках кода

## Git

- Коммиты на русском языке
- Без приписок "Generated with Claude Code" и "Co-Authored-By"
- Краткое описание изменений (1-2 предложения)

## Code Limits

- Максимум 600 строк кода в одном ответе
