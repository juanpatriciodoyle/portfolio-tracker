#!/bin/bash
set -e

echo "1. Checking Colima..."
if ! colima status >/dev/null 2>&1; then
  colima start
fi

echo "2. Starting PostgreSQL..."
docker compose up -d

echo "3. Starting API & Web concurrently..."
npx concurrently -k -n "api,web" -c "blue,green" \
  "cd apps/api && npm run dev" \
  "cd apps/web && npm run dev"
