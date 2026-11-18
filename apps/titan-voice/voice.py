"""German speech in the voice of Tom, made by Piper from a voice trained on his recording alone.

The voice (`voice/de_DE-tom-medium.onnx` and its `.json`) was trained with `train/` from Tom's recording
only, and is built into the image. Piper makes a sentence on the CPU in a fraction of a second, with no
graphics card.
"""

from __future__ import annotations

import io
import logging
import os
import wave
from pathlib import Path

from piper import PiperVoice, SynthesisConfig

log = logging.getLogger("titan-voice")


class TomVoice:
    def __init__(self, model: Path, length_scale: float, threads: int) -> None:
        if not model.is_file():
            raise FileNotFoundError(f"The voice {model.name} is not in {model.parent}; train it with train/, see README.md")
        os.environ.setdefault("OMP_NUM_THREADS", str(threads))
        self.voice = PiperVoice.load(str(model))
        self.config = SynthesisConfig(length_scale=length_scale)
        self.rate = self.voice.config.sample_rate
        log.info("Piper speaks with %s at %d Hz on the CPU", model.name, self.rate)

    def speak(self, text: str) -> bytes:
        out = io.BytesIO()
        with wave.open(out, "wb") as file:
            self.voice.synthesize_wav(text, file, syn_config=self.config)
        return out.getvalue()


def from_environment() -> TomVoice:
    data_dir = Path(os.environ.get("DATA_DIR", "/app/voice"))
    return TomVoice(
        model=data_dir / os.environ.get("VOICE", "de_DE-tom-medium.onnx"),
        length_scale=float(os.environ.get("LENGTH_SCALE", "1.0")),
        threads=int(os.environ.get("THREADS", "4")),
    )
