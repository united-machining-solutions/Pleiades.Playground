"""Cuts Tom's recording into sentences with their text, as the training data of his Piper voice.

Whisper writes down what is said, with the time of every word; the recording is cut at the ends of
sentences and at pauses into pieces of one to twelve seconds, mono at 22 050 Hz. It writes
`<out>/wavs/utt_NNN.wav` and `<out>/metadata.csv` (`utt_NNN.wav|text`), the format `piper.train` reads.
Everything stays on this computer, next to the recording.

    python prepare.py /data/Stimmprofil_Tom.wav /data/train
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from faster_whisper import WhisperModel

RATE = 22050
MIN_SECONDS = 1.0
SOFT_MAX_SECONDS = 8.0
MAX_SECONDS = 12.0
PAD = 0.12


def main(source: Path, out: Path) -> None:
    wavs = out / "wavs"
    wavs.mkdir(parents=True, exist_ok=True)
    model = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8")
    segments, _ = model.transcribe(str(source), language="de", word_timestamps=True, vad_filter=True, beam_size=5)
    words = [word for segment in segments for word in (segment.words or [])]
    print(f"{len(words)} words heard")

    pieces: list[tuple[float, float, str]] = []
    current: list = []
    for i, word in enumerate(words):
        current.append(word)
        start, end = current[0].start, word.end
        length = end - start
        pause = (words[i + 1].start - word.end) if i + 1 < len(words) else 9.0
        sentence_end = word.word.strip().endswith((".", "!", "?"))
        if length >= MAX_SECONDS or (length >= MIN_SECONDS and (sentence_end or (length >= SOFT_MAX_SECONDS and pause > 0.2) or pause > 0.6)):
            pieces.append((start, end, "".join(w.word for w in current).strip()))
            current = []
    if current and current[-1].end - current[0].start >= MIN_SECONDS:
        pieces.append((current[0].start, current[-1].end, "".join(w.word for w in current).strip()))

    lines = []
    for n, (start, end, text) in enumerate(pieces):
        name = f"utt_{n:03d}.wav"
        subprocess.run(
            ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-ss", f"{max(0.0, start - PAD):.3f}", "-to", f"{end + PAD:.3f}",
             "-i", str(source), "-ac", "1", "-ar", str(RATE), "-sample_fmt", "s16", str(wavs / name)],
            check=True,
        )
        lines.append(f"{name}|{text}")
        print(f"{name} {end - start:5.1f}s  {text}")
    (out / "metadata.csv").write_text("\n".join(lines) + "\n", encoding="utf-8")
    total = sum(end - start for start, end, _ in pieces)
    print(f"{len(pieces)} pieces, {total:.0f} s of speech, written to {out}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
