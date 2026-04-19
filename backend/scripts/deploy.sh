#!/bin/bash
# HealthWalk — Deploy script
# Запуск с локальной машины: bash backend/scripts/deploy.sh
#
# Что делает:
# 1. Собирает фронтенд (vite build)
# 2. Загружает dist/ и backend/ на сервер
# 3. Устанавливает зависимости на сервере
# 4. Перезапускает сервис

set -euo pipefail

# ── Конфигурация ──
SERVER="root@193.233.216.180"
SSH_KEY="/c/AI/AideServer/aide_server"
REMOTE_DIR="/opt/healthwalk"
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

SSH_CMD="ssh -i $SSH_KEY -o StrictHostKeyChecking=no"
SCP_CMD="scp -i $SSH_KEY -o StrictHostKeyChecking=no"

echo "═══════════════════════════════════"
echo "  HealthWalk Deploy"
echo "═══════════════════════════════════"

# ── 1. Сборка фронтенда ──
echo ""
echo "▸ [1/4] Building frontend..."
cd "$PROJECT_ROOT"

# Проверяем наличие node_modules
if [ ! -d "node_modules" ]; then
  echo "  Installing frontend dependencies..."
  npm install
fi

npm run build
echo "  ✓ Build complete: dist/"

# ── 2. Загрузка файлов на сервер ──
echo ""
echo "▸ [2/4] Uploading to server..."

# Создать директории если нет
$SSH_CMD $SERVER "mkdir -p $REMOTE_DIR/backend $REMOTE_DIR/dist"

# Синхронизация dist/ (статика)
echo "  Uploading dist/..."
$SCP_CMD -r "$PROJECT_ROOT/dist/"* "$SERVER:$REMOTE_DIR/dist/"

# Синхронизация backend/ (сервер)
echo "  Uploading backend/..."
$SCP_CMD "$PROJECT_ROOT/backend/server.js" "$SERVER:$REMOTE_DIR/backend/"
$SCP_CMD "$PROJECT_ROOT/backend/package.json" "$SERVER:$REMOTE_DIR/backend/"

echo "  ✓ Files uploaded"

# ── 3. Установка зависимостей на сервере ──
echo ""
echo "▸ [3/4] Installing server dependencies..."
$SSH_CMD $SERVER "cd $REMOTE_DIR/backend && npm install --production"
echo "  ✓ Dependencies installed"

# ── 4. Перезапуск сервиса ──
echo ""
echo "▸ [4/4] Restarting service..."

# Проверяем статус перед перезапуском
SERVICE_ACTIVE=$($SSH_CMD $SERVER "systemctl is-active healthwalk 2>/dev/null || true")
if [ "$SERVICE_ACTIVE" = "active" ]; then
  $SSH_CMD $SERVER "systemctl restart healthwalk"
  echo "  ✓ Service restarted"
else
  echo "  ⚠ Service not running (status: $SERVICE_ACTIVE)"
  echo "  → Start manually: systemctl start healthwalk"
fi

# ── Финальная проверка ──
echo ""
echo "▸ Health check..."
sleep 2
HEALTH=$($SSH_CMD $SERVER "curl -sf http://127.0.0.1:3000/api/health 2>/dev/null || echo 'FAIL'")
if echo "$HEALTH" | grep -q '"ok"'; then
  echo "  ✓ Server is healthy"
else
  echo "  ⚠ Health check failed: $HEALTH"
  echo "  → Check logs: journalctl -u healthwalk -n 50"
fi

echo ""
echo "═══════════════════════════════════"
echo "  Deploy complete!"
echo "═══════════════════════════════════"
