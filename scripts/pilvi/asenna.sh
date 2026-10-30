#!/usr/bin/env bash
# Pilvikoneen asennus (kerran, rootina, Ubuntu 24.04), ks. docs/pilvipalvelin.md:
#
#   curl -fsSL https://raw.githubusercontent.com/Luukalindgren/lunki/main/scripts/pilvi/asenna.sh -o asenna.sh
#   sudo bash asenna.sh <tunnelin token>
#
# Asentaa Dockerin ja cloudflaredin, hakee repositorion kansioon /srv/lunki/repo,
# käynnistää palvelimen ja ajastaa päivityksen (5 min välein, vain kun kukaan ei
# pelaa) ja yöllisen varmuuskopion. Voi ajaa uudelleen: valmiit vaiheet ohitetaan.
set -euo pipefail

token="${1:-}"
juuri=/srv/lunki
repo="$juuri/repo"

if [ "$(id -u)" -ne 0 ]; then
  echo "Aja rootina: sudo bash $0 <tunnelin token>" >&2
  exit 1
fi

echo "== Paketit"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -yq docker.io docker-compose-v2 git sqlite3 unattended-upgrades curl
systemctl enable --now docker

echo "== cloudflared (Cloudflaren pakettivarasto)"
if ! command -v cloudflared >/dev/null; then
  install -d -m 0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
    > /etc/apt/sources.list.d/cloudflared.list
  apt-get update -q
  apt-get install -yq cloudflared
fi
if [ -n "$token" ] && ! systemctl is-enabled cloudflared >/dev/null 2>&1; then
  cloudflared service install "$token"
fi

echo "== Repositorio ja tietokantakansio"
install -d "$juuri"
[ -d "$repo/.git" ] || git clone https://github.com/Luukalindgren/lunki.git "$repo"
# Kontin node-käyttäjä (uid 1000) kirjoittaa tietokannan.
install -d -o 1000 -g 1000 -m 0750 "$juuri/data"
install -d -m 0700 "$juuri/varmuuskopiot"

echo "== Palvelin"
docker compose -f "$repo/scripts/pilvi/compose.yaml" up -d --build

echo "== Ajastukset (päivitys ja varmuuskopio)"
cat > /etc/systemd/system/lunki-paivitys.service <<UNIT
[Unit]
Description=Lunkinjärvi: hae uusi koodi ja käynnistä palvelin uudelleen, kun kukaan ei pelaa
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/bash $repo/scripts/pilvi/paivita.sh
UNIT
cat > /etc/systemd/system/lunki-paivitys.timer <<'UNIT'
[Unit]
Description=Lunkinjärvi: päivityksen tarkistus 5 minuutin välein

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
UNIT
cat > /etc/systemd/system/lunki-varmuuskopio.service <<UNIT
[Unit]
Description=Lunkinjärvi: tietokannan varmuuskopio

[Service]
Type=oneshot
ExecStart=/usr/bin/bash $repo/scripts/pilvi/varmuuskopio.sh
UNIT
cat > /etc/systemd/system/lunki-varmuuskopio.timer <<'UNIT'
[Unit]
Description=Lunkinjärvi: tietokannan varmuuskopio joka yö

[Timer]
OnCalendar=*-*-* 04:00:00
Persistent=true

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now lunki-paivitys.timer lunki-varmuuskopio.timer

echo "== Tietoturvapäivitykset automaattisesti"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo
echo "Valmis. Tila: docker compose -f $repo/scripts/pilvi/compose.yaml ps"
curl -fsS http://127.0.0.1:2567/__healthcheck && echo " (palvelin vastaa)" || echo "Palvelin ei vielä vastaa, katso: docker compose -f $repo/scripts/pilvi/compose.yaml logs"
[ -n "$token" ] || echo "Tunnelia ei asennettu: aja uudelleen tunnelin tokenin kanssa (docs/pilvipalvelin.md, kohta 3)."
