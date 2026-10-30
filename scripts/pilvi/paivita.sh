#!/usr/bin/env bash
# Pilvikoneen päivitys (lunki-paivitys.timer 5 min välein, ks. asenna.sh).
#
#   paivita.sh          hakee mainin; jos palvelinkoodi muuttui eikä kukaan
#                       pelaa, kokoaa ja käynnistää palvelimen uudelleen
#   paivita.sh --heti   sama, vaikka pelaajia olisi yhteydessä (lunki pilvi uudelleen)
#
# Pelikoneen "lunki uudelleen" -komentoa ei pilvessä tarvita.
set -euo pipefail
cd "$(dirname "$0")/../.."

# Koko skripti luetaan ensin funktioksi: git merge voi vaihtaa tämän tiedoston
# kesken ajon.
paivita() {
  local compose palvelin yhteydet
  compose=(docker compose -f scripts/pilvi/compose.yaml)
  # Tiedostot, joiden muutos vaatii uuden kontin.
  palvelin=(Dockerfile .dockerignore package.json pnpm-lock.yaml pnpm-workspace.yaml
    tsconfig.base.json packages/server packages/shared scripts/pilvi/compose.yaml)

  git fetch -q origin main
  if git diff --quiet HEAD origin/main -- "${palvelin[@]}"; then
    # Vain asiakas tai ohjeet muuttuivat: koodi haetaan, palvelin jatkaa.
    git merge -q --ff-only origin/main
    if [ "${1:-}" != "--heti" ]; then exit 0; fi
  else
    # Avoimet WebSocket-yhteydet (tunneli → 127.0.0.1:2567) = joku on aulassa tai kisassa.
    yhteydet=$(ss -Htn state established '( sport = :2567 )' | wc -l)
    if [ "$yhteydet" -gt 0 ] && [ "${1:-}" != "--heti" ]; then
      echo "Uusi palvelinkoodi odottaa: $yhteydet yhteyttä auki."
      exit 0
    fi
    git merge -q --ff-only origin/main
  fi

  echo "Palvelin päivitetään versioon $(git rev-parse --short HEAD)."
  "${compose[@]}" up -d --build
  docker image prune -f >/dev/null
}
paivita "$@"
exit
