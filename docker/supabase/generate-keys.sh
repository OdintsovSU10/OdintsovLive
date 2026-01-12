#!/bin/bash

# Генерация JWT ключей для Supabase
# Требуется Node.js

echo "Генерация ключей для Supabase..."
echo ""

# Генерация JWT_SECRET
JWT_SECRET=$(openssl rand -base64 32)
echo "JWT_SECRET=$JWT_SECRET"
echo ""

# Генерация ANON_KEY
ANON_KEY=$(node -e "
const jwt = require('jsonwebtoken');
const payload = {
  role: 'anon',
  iss: 'supabase',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60) // 10 лет
};
console.log(jwt.sign(payload, '$JWT_SECRET'));
" 2>/dev/null)

if [ -z "$ANON_KEY" ]; then
  echo "Для генерации JWT ключей установите jsonwebtoken:"
  echo "  npm install -g jsonwebtoken"
  echo ""
  echo "Или сгенерируйте ключи онлайн:"
  echo "  https://supabase.com/docs/guides/self-hosting#api-keys"
  exit 1
fi

echo "ANON_KEY=$ANON_KEY"
echo ""

# Генерация SERVICE_ROLE_KEY
SERVICE_ROLE_KEY=$(node -e "
const jwt = require('jsonwebtoken');
const payload = {
  role: 'service_role',
  iss: 'supabase',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60) // 10 лет
};
console.log(jwt.sign(payload, '$JWT_SECRET'));
")

echo "SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"
echo ""
echo "Скопируйте эти значения в файл .env"
