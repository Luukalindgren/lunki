#!/usr/bin/env bash
# Tietokannan varmuuskopio joka yö (lunki-varmuuskopio.timer, ks. asenna.sh).
# SQLiten .backup on turvallinen, vaikka palvelin kirjoittaa samaan aikaan.
# 14 viimeisintä säilytetään kansiossa /srv/lunki/varmuuskopiot.
set -euo pipefail

data=/srv/lunki/data
kohde=/srv/lunki/varmuuskopiot

[ -f "$data/lunki.sqlite" ] || exit 0
sqlite3 "$data/lunki.sqlite" ".backup '$kohde/lunki-$(date +%F).sqlite'"
cp -p "$data/palauteavain.txt" "$kohde/" 2>/dev/null || true
ls -1t "$kohde"/lunki-*.sqlite | tail -n +15 | xargs -r rm --
