#!/bin/bash

# Скрипт деплоя OdintsovLive на Synology NAS
# Использование: ./deploy.sh

set -e

# Конфигурация
NAS_USER="odintsov.live"
NAS_HOST="192.168.1.11"
NAS_PORT="24"
NAS_PATH="/volume1/docker/frontend"
CONTAINER_NAME="odintsov-frontend"

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Деплой OdintsovLive ===${NC}"
echo ""

# 1. Сборка проекта
echo -e "${GREEN}[1/4] Сборка проекта...${NC}"
npm run build

if [ ! -d "dist" ]; then
    echo -e "${RED}Ошибка: папка dist не найдена${NC}"
    exit 1
fi

# 2. Синхронизация файлов на NAS
echo -e "${GREEN}[2/4] Копирование файлов на NAS...${NC}"
rsync -avz --delete -e "ssh -p ${NAS_PORT}" \
    dist/ \
    ${NAS_USER}@${NAS_HOST}:${NAS_PATH}/dist/

# 3. Копирование nginx.conf (если изменился)
echo -e "${GREEN}[3/4] Обновление конфигурации nginx...${NC}"
rsync -avz -e "ssh -p ${NAS_PORT}" \
    docker/frontend/nginx.conf \
    ${NAS_USER}@${NAS_HOST}:${NAS_PATH}/nginx.conf

# 4. Перезапуск контейнера
echo -e "${GREEN}[4/4] Перезапуск контейнера...${NC}"
ssh -p ${NAS_PORT} ${NAS_USER}@${NAS_HOST} "docker restart ${CONTAINER_NAME} 2>/dev/null || echo 'Контейнер не запущен'"

echo ""
echo -e "${GREEN}=== Деплой завершён! ===${NC}"
echo -e "Сайт доступен по адресу: https://odintsovlive.duckdns.org"
