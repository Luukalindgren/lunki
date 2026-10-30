"""
Puheäänten teko (#229) GitHub Actionsissa: Piper-tekstistä puheeksi suomeksi
(fi_FI-harri-medium) ja jälkikäsittely vanhahkoksi, käheäksi ja äriseväksi
mieheksi (sävel alas, särö, nopea tremolo, kompressointi). Tulokset:
packages/client/public/audio/puhe/<tunniste>-<n>.mp3 ja raakatiedostot
hakemistoon puhe-raaka/ (ei peliin).

Käyttö: python3 scripts/puhe/tee.py <äänimallin .onnx> [tunniste ...]
Tunnisteilla tehdään vain ne repliikit, ja muut tiedostot pysyvät ennallaan.
"""

import json
import subprocess
import sys
import wave
from pathlib import Path

from piper import PiperVoice

try:
    from piper import SynthesisConfig
except ImportError:  # vanhempi piper-tts
    SynthesisConfig = None

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'packages/client/public/audio/puhe'
RAW = ROOT / 'puhe-raaka'

# Sävel alas 12 %, sama tempo; särö ja 30 Hz:n tremolo antavat käheyden ja
# murinan; lopuksi kaistanrajaus, kompressointi, hiljaisuudet pois ja taso.
PITCH = 0.88


def audio_filter(rate: int) -> str:
    return ','.join(
        [
            f'asetrate={rate}*{PITCH}',
            'aresample=44100',
            f'atempo={1 / PITCH:.4f}',
            'highpass=f=90',
            'volume=9dB',
            'asoftclip=type=tanh',
            'tremolo=f=31:d=0.22',
            'lowpass=f=5200',
            'acompressor=threshold=-20dB:ratio=4:attack=5:release=80',
            'silenceremove=start_periods=1:start_threshold=-42dB',
            'areverse',
            'silenceremove=start_periods=1:start_threshold=-42dB',
            'areverse',
            'apad=pad_dur=0.05',
            'loudnorm=I=-16:TP=-1.5:LRA=7',
        ]
    )


def synthesize(voice, text: str, path: Path) -> int:
    """Kirjoittaa repliikin wav-tiedostoon ja palauttaa näytetaajuuden."""
    # Turhautunut ja nopea puhe: lyhyempi kesto ja enemmän vaihtelua.
    params = dict(length_scale=0.88, noise_scale=0.8, noise_w_scale=0.9)
    with wave.open(str(path), 'wb') as wf:
        if SynthesisConfig is not None:
            voice.synthesize_wav(text, wf, syn_config=SynthesisConfig(**params))
        else:
            params['noise_w'] = params.pop('noise_w_scale')
            voice.synthesize(text, wf, **params)
    with wave.open(str(path), 'rb') as wf:
        return wf.getframerate()


def main() -> None:
    voice = PiperVoice.load(sys.argv[1])
    lines = json.loads((Path(__file__).parent / 'repliikit.json').read_text('utf-8'))
    OUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[2:])
    for key, texts in lines.items():
        if key.startswith('_') or (only and key not in only):
            continue
        for n, text in enumerate(texts, 1):
            raw = RAW / f'{key}-{n}.wav'
            rate = synthesize(voice, text, raw)
            out = OUT / f'{key}-{n}.mp3'
            subprocess.run(
                ['ffmpeg', '-loglevel', 'error', '-y', '-i', str(raw), '-af', audio_filter(rate),
                 '-ac', '1', '-ar', '44100', '-codec:a', 'libmp3lame', '-b:a', '48k', str(out)],
                check=True,
            )
            print(f'{out.name}: {text}')


if __name__ == '__main__':
    main()
