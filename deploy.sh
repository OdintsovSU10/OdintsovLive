#!/bin/bash

# Деплой SPA live.meridianai.ru на Selectel (статика only).
# Supabase крутится на сервере в /opt/supabase — скрипт его не трогает.
# Использование: ./deploy.sh

set -euo pipefail

SSH_TARGET="${SSH_TARGET:-selectel}"
REMOTE_PATH="${REMOTE_PATH:-/opt/sites/odintsovlive}"
DIST_DIR="${DIST_DIR:-dist}"
SITE_URL="${SITE_URL:-https://live.meridianai.ru}"
EXPECTED_SUPABASE_URL="${EXPECTED_SUPABASE_URL:-https://live.meridianai.ru}"
SKIP_BACKUP="${SKIP_BACKUP:-0}"
SKIP_VERIFY="${SKIP_VERIFY:-0}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== Деплой live.meridianai.ru ===${NC}"
echo ""

if ! ssh -o ConnectTimeout=8 -o BatchMode=yes "$SSH_TARGET" "echo ok" >/dev/null 2>&1; then
  echo -e "${RED}Ошибка: не удалось подключиться к ${SSH_TARGET}${NC}"
  echo -e "${YELLOW}Добавьте Host selectel в ~/.ssh/config (root@135.106.162.110) или задайте SSH_TARGET${NC}"
  exit 1
fi

if [[ -f .env ]]; then
  env_url="$(grep -E '^VITE_SUPABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d "\"'" || true)"
  if [[ -n "$env_url" && "$env_url" != "$EXPECTED_SUPABASE_URL" ]]; then
    echo -e "${YELLOW}Предупреждение: VITE_SUPABASE_URL=${env_url}, ожидается ${EXPECTED_SUPABASE_URL}${NC}"
  fi
elif [[ -z "${VITE_SUPABASE_URL:-}" ]]; then
  echo -e "${YELLOW}Предупреждение: нет .env — убедитесь, что VITE_SUPABASE_URL=${EXPECTED_SUPABASE_URL}${NC}"
fi

echo -e "${GREEN}Сервер:${NC} ${SSH_TARGET} → ${REMOTE_PATH}"
echo ""

echo -e "${GREEN}[1/3] Сборка (локально)...${NC}"
npm run build

if [[ ! -d "$DIST_DIR" ]]; then
  echo -e "${RED}Ошибка: папка ${DIST_DIR} не найдена${NC}"
  exit 1
fi

# Без ключа Supabase сайт открывается, но все запросы к API получают 401
if ! grep -qE 'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.|sb_publishable_' "$DIST_DIR"/assets/*.js; then
  echo -e "${RED}Ошибка: в сборке нет ключа Supabase — проверьте VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY в .env${NC}"
  exit 1
fi

if ! grep -qF "$EXPECTED_SUPABASE_URL" "$DIST_DIR"/assets/*.js; then
  echo -e "${RED}Ошибка: в сборке нет ${EXPECTED_SUPABASE_URL} — проверьте VITE_SUPABASE_URL${NC}"
  exit 1
fi

echo -e "${GREEN}[2/3] Заливка статики...${NC}"
if [[ "$SKIP_BACKUP" != "1" ]]; then
  ssh "$SSH_TARGET" "cp -a '${REMOTE_PATH}' '${REMOTE_PATH}.bak-$(date +%F-%H%M)'"
  echo -e "${GREEN}Бэкап создан на сервере.${NC}"
fi

rsync -az --delete "${DIST_DIR}/" "${SSH_TARGET}:${REMOTE_PATH}/"

echo -e "${GREEN}[3/3] Готово.${NC}"
echo -e "Контейнер не перезапускаем — bind-mount подхватывает файлы сразу."
echo ""

if [[ "$SKIP_VERIFY" != "1" ]]; then
  echo -e "${GREEN}Проверка:${NC}"
  curl -fsSI "${SITE_URL}" | head -1
  curl -fsS "${SITE_URL}/auth/v1/health" >/dev/null && echo "auth health: ok"
fi

echo ""
echo -e "${GREEN}=== Деплой завершён ===${NC}"
echo -e "Сайт: ${SITE_URL}"
