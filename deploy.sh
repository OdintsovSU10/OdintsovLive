#!/bin/bash

# Скрипт деплоя OdintsovLive на VDS (odintsovlive.fvds.ru)
# Использование: ./deploy.sh

set -euo pipefail

VDS_ALIAS="${VDS_ALIAS:-vds}"
VDS_PATH="${VDS_PATH:-/var/www/odintsovlive}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== Деплой OdintsovLive ===${NC}"
echo ""

# Проверка SSH
if ! ssh -o ConnectTimeout=8 -o BatchMode=yes "$VDS_ALIAS" "echo ok" >/dev/null 2>&1; then
  echo -e "${RED}Ошибка: не удалось подключиться к VDS (alias: $VDS_ALIAS)${NC}"
  exit 1
fi

echo -e "${GREEN}VDS:${NC} $VDS_ALIAS → odintsovlive.fvds.ru"
echo ""

# 1. Сборка
echo -e "${GREEN}[1/3] Сборка проекта...${NC}"
npm run build

[[ ! -d "dist" ]] && echo -e "${RED}Ошибка: папка dist не найдена${NC}" && exit 1

# 2. Загрузка dist
echo -e "${GREEN}[2/3] Загрузка dist на VDS...${NC}"
ssh "$VDS_ALIAS" "mkdir -p '${VDS_PATH}' && find '${VDS_PATH}' -mindepth 1 -delete"
tar -C dist -czf - . | ssh "$VDS_ALIAS" "tar -xzf - -C '${VDS_PATH}'"

# 3. Итог
echo -e "${GREEN}[3/3] Готово!${NC}"
FILE_COUNT=$(ssh "$VDS_ALIAS" "ls '${VDS_PATH}' | wc -l")
echo -e "Файлов: ${FILE_COUNT}"
echo ""
echo -e "${GREEN}=== Деплой завершён ===${NC}"
echo -e "Сайт: https://odintsovlive.fvds.ru"
