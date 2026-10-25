#!/usr/bin/env bash
# Lunki-pelipalvelimen etäohjaus Macilta SSH:n yli (ks. docs/windows-palvelin.md).
#
#   lunki                  palvelimen ja tunnelin tila
#   lunki kaynnista        päivittää koodin ja käynnistää palvelimen
#   lunki pysayta          pysäyttää palvelimen
#   lunki uudelleen        pysäyttää ja käynnistää (hakee samalla uuden koodin)
#   lunki loki [seuraa]    palvelimen lokin loppu (seuraa: Ctrl+C lopettaa)
#   lunki ssh              tavallinen SSH-istunto pelikoneelle
#
# Oletuksena käytetään ~/.ssh/config-oikotietä "lunki" ja pelikoneen kansiota
# ~\Projektit\lunki. Muutettavissa: LUNKI_SSH_HOST ja LUNKI_PC_DIR.
set -euo pipefail

host="${LUNKI_SSH_HOST:-lunki}"
dir="${LUNKI_PC_DIR:-~\\Projektit\\lunki}"
ps1='.\scripts\windows\lunki.ps1'

case "${1:-tila}" in
  tila | status) run="$ps1 tila" ;;
  kaynnista | käynnistä | start) run="$ps1 kaynnista" ;;
  pysayta | pysäytä | stop) run="$ps1 pysayta" ;;
  uudelleen | restart) run="$ps1 pysayta; $ps1 kaynnista" ;;
  seuraa) run="$ps1 loki -Seuraa" ;;
  ssh) exec ssh "$host" ;;
  loki | log)
    case "${2:-}" in
      seuraa | -f | -Seuraa) run="$ps1 loki -Seuraa" ;;
      *) run="$ps1 loki" ;;
    esac
    ;;
  *)
    sed -n '4,9p' "$0" | sed 's/^# //' >&2
    exit 2
    ;;
esac

# -t: Ctrl+C katkaisee lokin seuraamisen siististi.
tty=()
[ -t 0 ] && tty=(-t)
exec ssh "${tty[@]}" "$host" "cd $dir; $run"
