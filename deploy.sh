#!/bin/bash

# Скрипт деплоя OdintsovLive на Synology NAS
# Использование: ./deploy.sh

set -euo pipefail

# Конфигурация (можно переопределить через env)
NAS_USER="${NAS_USER:-odintsov.live}"
NAS_PORT="${NAS_PORT:-24}"
NAS_HOST_LOCAL="${NAS_HOST_LOCAL:-192.168.1.11}"
NAS_HOST_EXTERNAL="${NAS_HOST_EXTERNAL:-95.165.99.67}"
NAS_HOST="${NAS_HOST:-}"
NAS_PATH="${NAS_PATH:-/volume1/docker/frontend}"
CONTAINER_NAME="${CONTAINER_NAME:-odintsov-frontend}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_nas_deploy}"

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SSH_OPTS=(
  -F /dev/null
  -p "$NAS_PORT"
  -i "$SSH_KEY"
  -o IdentitiesOnly=yes
  -o PreferredAuthentications=publickey
  -o PasswordAuthentication=no
  -o BatchMode=yes
  -o ConnectTimeout=8
)

echo -e "${YELLOW}=== Деплой OdintsovLive ===${NC}"
echo ""

if [[ ! -f "$SSH_KEY" ]]; then
  echo -e "${RED}Ошибка: SSH-ключ не найден: $SSH_KEY${NC}"
  exit 1
fi

check_ssh() {
  local host="$1"
  ssh "${SSH_OPTS[@]}" "${NAS_USER}@${host}" "echo ok" >/dev/null 2>&1
}

if [[ -z "$NAS_HOST" ]]; then
  if check_ssh "$NAS_HOST_LOCAL"; then
    NAS_HOST="$NAS_HOST_LOCAL"
  elif check_ssh "$NAS_HOST_EXTERNAL"; then
    NAS_HOST="$NAS_HOST_EXTERNAL"
  else
    echo -e "${RED}Ошибка: не удалось подключиться к NAS ни по локальному, ни по внешнему адресу${NC}"
    echo -e "${YELLOW}Проверьте SSH-ключ и доступность ${NAS_HOST_LOCAL}:${NAS_PORT} / ${NAS_HOST_EXTERNAL}:${NAS_PORT}${NC}"
    exit 1
  fi
fi

echo -e "${GREEN}NAS host:${NC} ${NAS_HOST}"
echo -e "${GREEN}SSH key:${NC} ${SSH_KEY}"
echo ""

# 1. Сборка проекта
echo -e "${GREEN}[1/4] Сборка проекта...${NC}"
npm run build

if [[ ! -d "dist" ]]; then
  echo -e "${RED}Ошибка: папка dist не найдена${NC}"
  exit 1
fi

# 2. Загрузка dist (tar + ssh)
echo -e "${GREEN}[2/4] Загрузка dist на NAS...${NC}"
ssh "${SSH_OPTS[@]}" "${NAS_USER}@${NAS_HOST}" \
  "mkdir -p '${NAS_PATH}/dist' && find '${NAS_PATH}/dist' -mindepth 1 -delete"

tar -C dist -czf - . | ssh "${SSH_OPTS[@]}" "${NAS_USER}@${NAS_HOST}" \
  "tar -xzf - -C '${NAS_PATH}/dist'"

# 3. Обновление nginx.conf
echo -e "${GREEN}[3/4] Обновление nginx.conf...${NC}"
if ! ssh "${SSH_OPTS[@]}" "${NAS_USER}@${NAS_HOST}" \
  "cat > '${NAS_PATH}/nginx.conf'" < docker/frontend/nginx.conf; then
  echo -e "${YELLOW}Нет прав на прямую запись. Пробуем через /tmp и sudo cp...${NC}"

  ssh "${SSH_OPTS[@]}" "${NAS_USER}@${NAS_HOST}" \
    "cat > '/tmp/odintsovlive_nginx.conf'" < docker/frontend/nginx.conf

  if ! ssh "${SSH_OPTS[@]}" "${NAS_USER}@${NAS_HOST}" \
    "sudo -n cp '/tmp/odintsovlive_nginx.conf' '${NAS_PATH}/nginx.conf' 2>/dev/null || cp '/tmp/odintsovlive_nginx.conf' '${NAS_PATH}/nginx.conf'"; then
    echo -e "${RED}Ошибка: не удалось обновить nginx.conf (нужны права на ${NAS_PATH})${NC}"
    exit 1
  fi

  ssh "${SSH_OPTS[@]}" "${NAS_USER}@${NAS_HOST}" "rm -f '/tmp/odintsovlive_nginx.conf'" >/dev/null 2>&1 || true
fi

# 4. Перезапуск контейнера
echo -e "${GREEN}[4/4] Перезапуск контейнера...${NC}"
if restart_output=$(ssh "${SSH_OPTS[@]}" "${NAS_USER}@${NAS_HOST}" \
  "sudo -n /usr/local/bin/docker restart '${CONTAINER_NAME}' 2>/dev/null || /usr/local/bin/docker restart '${CONTAINER_NAME}' 2>/dev/null"); then
  echo "$restart_output"
else
  echo -e "${RED}Ошибка: не удалось перезапустить контейнер ${CONTAINER_NAME}${NC}"
  echo -e "${YELLOW}Проверьте sudo NOPASSWD для /usr/local/bin/docker restart ${CONTAINER_NAME}${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}=== Деплой завершён! ===${NC}"
echo -e "Сайт: https://odintsovlive.duckdns.org"
