#!/usr/bin/env bash
# Pilvipalvelimen ohjaus Macilta (docs/pilvipalvelin.md), myös komennolla "lunki pilvi".
#
#   lunki pilvi                 palvelimen, tunnelin ja ajastusten tila
#   lunki pilvi uudelleen       hakee uuden koodin ja käynnistää palvelimen heti
#   lunki pilvi loki [seuraa]   palvelimen lokin loppu (seuraa: Ctrl+C lopettaa)
#   lunki pilvi ssh             SSH-istunto pilvikoneelle
#   lunki pilvi paalle          luo koneen viimeisimmästä tilannekuvasta
#   lunki pilvi pois            tilannekuva talteen ja kone pois (maksu vain kuvasta)
#
# paalle ja pois tarvitsevat Hetznerin hcloud-komennon (brew install hcloud).
# Muutettavissa: LUNKI_PILVI_SSH (SSH-oikotie, oletus lunki-pilvi),
# LUNKI_PILVI_NIMI (koneen nimi, lunki), LUNKI_PILVI_TYYPPI (cax11),
# LUNKI_PILVI_SIJAINTI (hel1), LUNKI_PILVI_AVAIN (SSH-avaimen nimi Hetznerissä,
# lunki) ja LUNKI_PILVI_PALOMUURI (lunki).
set -euo pipefail

ssh_host="${LUNKI_PILVI_SSH:-lunki-pilvi}"
nimi="${LUNKI_PILVI_NIMI:-lunki}"
tyyppi="${LUNKI_PILVI_TYYPPI:-cax11}"
sijainti="${LUNKI_PILVI_SIJAINTI:-hel1}"
avain="${LUNKI_PILVI_AVAIN:-lunki}"
palomuuri="${LUNKI_PILVI_PALOMUURI:-lunki}"
repo=/srv/lunki/repo
compose="docker compose -f $repo/scripts/pilvi/compose.yaml"

# Koneen osoite vaihtuu, kun se luodaan tilannekuvasta uudelleen. Jos hcloud on
# asennettu, osoite haetaan siltä; SSH-oikotien HostKeyAlias pitää avaimen samana.
pilvi_ssh() {
  local ip=()
  if command -v hcloud >/dev/null && hcloud server describe "$nimi" >/dev/null 2>&1; then
    ip=(-o "HostName=$(hcloud server ip "$nimi")")
  fi
  ssh ${ip[@]+"${ip[@]}"} "$@"
}

# Tilannekuvat tunnisteella app=lunki, vanhin ensin (id kasvaa).
tilannekuvat() {
  hcloud image list --type snapshot --selector app=lunki -o noheader -o columns=id | sort -n
}

case "${1:-tila}" in
  tila | status)
    pilvi_ssh "$ssh_host" "$compose ps; systemctl is-active cloudflared; systemctl list-timers 'lunki-*' --no-pager"
    ;;
  uudelleen | restart)
    pilvi_ssh "$ssh_host" "bash $repo/scripts/pilvi/paivita.sh --heti"
    ;;
  loki | log)
    case "${2:-}" in
      seuraa | -f) pilvi_ssh -t "$ssh_host" "$compose logs -f --tail 100" ;;
      *) pilvi_ssh "$ssh_host" "$compose logs --tail 100" ;;
    esac
    ;;
  ssh)
    pilvi_ssh "$ssh_host"
    ;;
  paalle | päälle | on)
    if hcloud server describe "$nimi" >/dev/null 2>&1; then
      echo "Kone $nimi on jo olemassa: $(hcloud server describe "$nimi" -o format='{{.Status}}')"
      exit 0
    fi
    kuva=$(tilannekuvat | tail -n 1)
    if [ -z "$kuva" ]; then
      echo "Tilannekuvaa (app=lunki) ei löydy. Luo kone ensin ohjeen mukaan (docs/pilvipalvelin.md)." >&2
      exit 1
    fi
    hcloud server create --name "$nimi" --type "$tyyppi" --location "$sijainti" \
      --image "$kuva" --ssh-key "$avain" --firewall "$palomuuri" --label app=lunki
    echo "Kone käynnistyy. Palvelin ja tunneli nousevat itsestään, ja uusi koodi haetaan minuutin päästä."
    for _ in $(seq 36); do
      if curl -fsS https://peli.lunkinjarvi.com/__healthcheck >/dev/null 2>&1; then
        echo "Palvelin vastaa: https://peli.lunkinjarvi.com/__healthcheck"
        exit 0
      fi
      sleep 5
    done
    echo "Palvelin ei vastannut 3 minuutissa. Katso: lunki pilvi loki" >&2
    exit 1
    ;;
  pois | off)
    if ! hcloud server describe "$nimi" >/dev/null 2>&1; then
      echo "Konetta $nimi ei ole: pilvipalvelin on jo pois."
      exit 0
    fi
    vanhat=$(tilannekuvat)
    # Palvelin pysäytetään ensin, jotta tietokanta on levyllä eheänä.
    pilvi_ssh "$ssh_host" "$compose stop && sync" || echo "Palvelinta ei saatu pysäytettyä SSH:lla, jatketaan."
    hcloud server shutdown "$nimi"
    for _ in $(seq 24); do
      [ "$(hcloud server describe "$nimi" -o format='{{.Status}}')" = off ] && break
      sleep 5
    done
    [ "$(hcloud server describe "$nimi" -o format='{{.Status}}')" = off ] || hcloud server poweroff "$nimi"
    hcloud server create-image --type snapshot --label app=lunki \
      --description "lunki $(date +%Y-%m-%d)" "$nimi"
    uusi=$(tilannekuvat | tail -n 1)
    if [ -z "$uusi" ] || printf '%s\n' "$vanhat" | grep -qx "$uusi"; then
      echo "Uutta tilannekuvaa ei löydy. Konetta ei poisteta." >&2
      exit 1
    fi
    hcloud server delete "$nimi"
    # Vain uusin tilannekuva jää (maksu menee kuvan koon mukaan).
    for vanha in $vanhat; do hcloud image delete "$vanha"; done
    echo "Pilvipalvelin on pois. Tilannekuva $uusi odottaa: lunki pilvi paalle"
    ;;
  *)
    sed -n '4,9p' "$0" | sed 's/^# //' >&2
    exit 2
    ;;
esac
