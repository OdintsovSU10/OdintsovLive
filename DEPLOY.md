# Развёртывание на Synology NAS

## Конфигурация

| Параметр        | Значение                            |
|-----------------|-------------------------------------|
| NAS IP (лок.)   | `192.168.1.11`                      |
| NAS IP (внеш.)  | `95.165.99.67`                      |
| SSH порт        | `24`                                |
| Пользователь    | `odintsov.live`                     |
| SSH ключ        | `~/.ssh/id_ed25519_nas_deploy`      |
| Путь фронтенда  | `/volume1/docker/frontend`          |
| Контейнер       | `odintsov-frontend`                 |
| Домен           | `odintsovlive.duckdns.org`          |
| PostgreSQL порт | `5433`                              |

---

## Быстрый деплой

```bash
./deploy.sh
```

Скрипт:
- собирает фронтенд;
- загружает `dist` через `tar + ssh`;
- обновляет `docker/frontend/nginx.conf` на NAS;
- перезапускает `odintsov-frontend`.

Скрипт автоматически пробует локальный NAS (`192.168.1.11`), затем внешний (`95.165.99.67`).

---

## Требования перед деплоем

### 1) SSH-ключ для NAS

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_nas_deploy -C "nas-deploy-no-pass"
cat ~/.ssh/id_ed25519_nas_deploy.pub | ssh -p 24 odintsov.live@95.165.99.67 "umask 077; mkdir -p ~/.ssh; touch ~/.ssh/authorized_keys; cat >> ~/.ssh/authorized_keys; chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys"
```

### 2) Проверка входа без пароля

```bash
ssh -F /dev/null -p 24 -i ~/.ssh/id_ed25519_nas_deploy -o IdentitiesOnly=yes -o PasswordAuthentication=no odintsov.live@95.165.99.67 "echo KEY_OK"
```

### 3) Разрешение на перезапуск контейнера без пароля

На NAS (один раз):

```bash
echo 'odintsov.live ALL=(root) NOPASSWD: /usr/local/bin/docker restart odintsov-frontend' | sudo tee /etc/sudoers.d/odintsovlive-deploy >/dev/null
sudo chmod 440 /etc/sudoers.d/odintsovlive-deploy
```

Проверка:

```bash
ssh -p 24 odintsov.live@95.165.99.67 "sudo -n /usr/local/bin/docker restart odintsov-frontend"
```

---

## Ручной деплой (без скрипта)

```bash
npm run build
```

```bash
ssh -F /dev/null -p 24 -i ~/.ssh/id_ed25519_nas_deploy -o IdentitiesOnly=yes -o PasswordAuthentication=no odintsov.live@95.165.99.67 "mkdir -p /volume1/docker/frontend/dist && find /volume1/docker/frontend/dist -mindepth 1 -delete"
```

```bash
tar -C dist -czf - . | ssh -F /dev/null -p 24 -i ~/.ssh/id_ed25519_nas_deploy -o IdentitiesOnly=yes -o PasswordAuthentication=no odintsov.live@95.165.99.67 "tar -xzf - -C /volume1/docker/frontend/dist"
```

```bash
ssh -F /dev/null -p 24 -i ~/.ssh/id_ed25519_nas_deploy -o IdentitiesOnly=yes -o PasswordAuthentication=no odintsov.live@95.165.99.67 "cat > /volume1/docker/frontend/nginx.conf" < docker/frontend/nginx.conf
```

```bash
ssh -F /dev/null -p 24 -i ~/.ssh/id_ed25519_nas_deploy -o IdentitiesOnly=yes -o PasswordAuthentication=no odintsov.live@95.165.99.67 "sudo -n /usr/local/bin/docker restart odintsov-frontend"
```

---

## Переопределение параметров deploy.sh

```bash
NAS_HOST=95.165.99.67 \
NAS_PORT=24 \
NAS_USER=odintsov.live \
SSH_KEY=$HOME/.ssh/id_ed25519_nas_deploy \
./deploy.sh
```

Доступные переменные:
- `NAS_HOST` (если не задан, скрипт сам выберет локальный/внешний);
- `NAS_HOST_LOCAL`;
- `NAS_HOST_EXTERNAL`;
- `NAS_PORT`;
- `NAS_USER`;
- `SSH_KEY`;
- `NAS_PATH`;
- `CONTAINER_NAME`.

---

## Работа с БД

### Подключение к PostgreSQL

```bash
sudo docker exec -it supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres
```

### Выполнение SQL-команды

```bash
sudo docker exec supabase-db psql -h /var/run/postgresql -p 5433 -U postgres -d postgres -c "SELECT * FROM calendar_days LIMIT 5;"
```

### Импорт SQL файла

```bash
sudo docker exec -i supabase-db psql -U postgres -h localhost -p 5433 -d postgres < /путь/к/файлу.sql
```

---

## Troubleshooting

### `Permission denied` при `ssh`/`rsync`

- Проверь ключ:
```bash
ssh -F /dev/null -p 24 -i ~/.ssh/id_ed25519_nas_deploy -o IdentitiesOnly=yes -o PasswordAuthentication=no odintsov.live@95.165.99.67 "echo KEY_OK"
```
- Проверь права на NAS:
  - `~` должен быть `755`;
  - `~/.ssh` должен быть `700`;
  - `~/.ssh/authorized_keys` должен быть `600`.

### `sudo: a password is required`

Нет правила `NOPASSWD` для `docker restart`. Добавь sudoers правило (см. выше).

### `sudo: visudo: command not found`

На некоторых NAS `visudo` отсутствует. Используй `sudo tee` + `chmod 440`.

### `zsh: parse error near ')'`

В интерактивной `zsh` строки вида `# 1)` без `setopt interactive_comments` вызывают ошибку.

### Фронт доступен, но API не отвечает

Проверь reverse proxy и маршруты:
- `/auth/v1`
- `/rest/v1`
- `/storage/v1`

