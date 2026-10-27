#!/bin/bash
# =====================================================================
#  Ponte WhatsApp · Central MKT — instalação automática no Oracle Cloud
#  Cole este script inteiro em: Criar instância → Mostrar opções avançadas
#  → Gerenciamento → "Colar script cloud-init". Ele roda sozinho no 1º boot.
#
#  EDITE SÓ AS DUAS LINHAS ABAIXO:
GITHUB_USUARIO="SEU_USUARIO_GITHUB"
CHAVE_SECRETA="COLE_AQUI_A_CHAVE_SECRETA"
# =====================================================================
set -euxo pipefail
exec > >(tee -a /var/log/ponte-instalacao.log) 2>&1

REPO="https://github.com/${GITHUB_USUARIO}/ponte-whatsapp.git"
APP=/opt/ponte-whatsapp
DADOS=/var/lib/ponte-whatsapp
export DEBIAN_FRONTEND=noninteractive

# 1. Memória extra (a máquina gratuita tem 1 GB)
if ! swapon --show | grep -q swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 2. Node.js 22, Git e Caddy (HTTPS automático)
apt-get update
apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https netfilter-persistent iptables-persistent
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy

# 3. Código da ponte
id -u ponte >/dev/null 2>&1 || useradd --system --home "$DADOS" --shell /usr/sbin/nologin ponte
mkdir -p "$DADOS" && chown ponte:ponte "$DADOS"
if [ -d "$APP/.git" ]; then git -C "$APP" pull --ff-only; else git clone --depth 1 "$REPO" "$APP"; fi
cd "$APP" && npm ci --omit=dev --no-audit --no-fund
chown -R ponte:ponte "$APP"

# 4. Configuração e serviço (religa sozinho se cair ou se o servidor reiniciar)
cat > /etc/ponte-whatsapp.env <<EOF
CHAVE_SECRETA=${CHAVE_SECRETA}
DADOS_DIR=${DADOS}
PORT=3777
HOST=127.0.0.1
EOF
chmod 600 /etc/ponte-whatsapp.env
cat > /etc/systemd/system/ponte-whatsapp.service <<EOF
[Unit]
Description=Ponte WhatsApp Central MKT
After=network-online.target
Wants=network-online.target
[Service]
User=ponte
WorkingDirectory=${APP}
EnvironmentFile=/etc/ponte-whatsapp.env
ExecStart=/usr/bin/node ${APP}/ponte.js
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now ponte-whatsapp

# 5. Endereço público com HTTPS (IP-com-tracos.sslip.io)
IP=$(curl -fsS https://api.ipify.org || curl -fsS https://ifconfig.me)
DOMINIO="$(echo "$IP" | tr '.' '-').sslip.io"
cat > /etc/caddy/Caddyfile <<EOF
${DOMINIO} {
  reverse_proxy 127.0.0.1:3777
}
EOF
systemctl restart caddy

# 6. Liberar portas 80/443 no firewall interno da imagem Oracle
iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
netfilter-persistent save

echo "PRONTO · Painel: https://${DOMINIO}/  ·  Conector: https://${DOMINIO}/mcp" | tee /root/ponte-endereco.txt
