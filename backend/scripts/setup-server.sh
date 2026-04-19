#!/bin/bash
# HealthWalk — First-time server setup
# Запуск НА СЕРВЕРЕ: bash setup-server.sh
#
# Что делает:
# 1. Устанавливает Node.js 22 LTS
# 2. Устанавливает Nginx
# 3. Создаёт директории и пользователя
# 4. Копирует конфиги (nginx, systemd)
# 5. Настраивает SSL через certbot
#
# Предусловия:
# - Ubuntu 24.04
# - Домен указывает на IP сервера (A-запись)
# - Скрипт запускается от root

set -euo pipefail

DOMAIN="${1:-}"
APP_DIR="/opt/healthwalk"

if [ -z "$DOMAIN" ]; then
  echo "Usage: bash setup-server.sh <domain>"
  echo "Example: bash setup-server.sh healthwalk.example.com"
  exit 1
fi

echo "═══════════════════════════════════"
echo "  HealthWalk Server Setup"
echo "  Domain: $DOMAIN"
echo "═══════════════════════════════════"

# ── 1. System packages ──
echo ""
echo "▸ [1/6] Installing system packages..."
apt-get update -qq
apt-get install -y -qq curl nginx certbot python3-certbot-nginx ufw

# ── 2. Node.js 22 LTS ──
echo ""
echo "▸ [2/6] Installing Node.js 22..."
if ! command -v node &>/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
echo "  Node.js $(node -v), npm $(npm -v)"

# ── 3. Create app directory ──
echo ""
echo "▸ [3/6] Setting up directories..."
mkdir -p "$APP_DIR/backend" "$APP_DIR/dist"
chown -R www-data:www-data "$APP_DIR"

# ── 4. Nginx config ──
echo ""
echo "▸ [4/6] Configuring Nginx..."

# Создаём конфиг из шаблона (заменяем домен)
cat > /etc/nginx/sites-available/healthwalk << 'NGINX_EOF'
upstream healthwalk_backend {
    server 127.0.0.1:3000;
    keepalive 16;
}

server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name DOMAIN_PLACEHOLDER;

    ssl_certificate /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    client_max_body_size 600M;

    location /assets/ {
        alias /opt/healthwalk/dist/assets/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    location ~* \.(ico|png|webmanifest|robots\.txt)$ {
        root /opt/healthwalk/dist;
        expires 7d;
        access_log off;
    }

    location /api/ {
        proxy_pass http://healthwalk_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 60s;
    }

    location /ws/ {
        proxy_pass http://healthwalk_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;
    }

    location / {
        proxy_pass http://healthwalk_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
    }
}
NGINX_EOF

# Заменяем плейсхолдер на реальный домен
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/nginx/sites-available/healthwalk

# Активируем сайт
ln -sf /etc/nginx/sites-available/healthwalk /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Проверяем конфиг
nginx -t

# ── 5. Systemd service ──
echo ""
echo "▸ [5/6] Installing systemd service..."

cat > /etc/systemd/system/healthwalk.service << 'SERVICE_EOF'
[Unit]
Description=HealthWalk Web Application
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/healthwalk/backend
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
StartLimitBurst=5
StartLimitIntervalSec=60

Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOST=127.0.0.1
EnvironmentFile=-/opt/healthwalk/backend/.env

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/healthwalk
PrivateTmp=true

StandardOutput=journal
StandardError=journal
SyslogIdentifier=healthwalk

[Install]
WantedBy=multi-user.target
SERVICE_EOF

systemctl daemon-reload
systemctl enable healthwalk

# ── 6. Firewall ──
echo ""
echo "▸ [6/6] Configuring firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ── SSL (попробуем, но не обязательно на этом этапе) ──
echo ""
echo "═══════════════════════════════════"
echo "  Setup complete!"
echo "═══════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Deploy the app:  bash backend/scripts/deploy.sh"
echo "  2. Create .env:     nano /opt/healthwalk/backend/.env"
echo "  3. Start service:   systemctl start healthwalk"
echo "  4. Start nginx:     systemctl restart nginx"
echo "  5. SSL certificate: certbot --nginx -d $DOMAIN"
echo ""
echo "Logs:"
echo "  journalctl -u healthwalk -f"
echo "  tail -f /var/log/nginx/access.log"
