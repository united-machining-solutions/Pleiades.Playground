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

from lfs import fetch, is_pointer

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
    model = data_dir / os.environ.get("VOICE", "de_DE-tom-medium.onnx")
    # An image built without the voice, only its pointer of Git LFS, tries once more here, into a folder it
    # may write, with the configuration of the voice beside it.
    if is_pointer(model):
        fetched = Path(os.environ.get("FETCH_DIR", "/tmp/titan-voice")) / model.name
        if not fetched.is_file() and fetch(model, fetched):
            config = model.with_name(model.name + ".json")
            if config.is_file():
                fetched.with_name(config.name).write_bytes(config.read_bytes())
        if fetched.is_file():
            model = fetched
        else:
            raise FileNotFoundError(f"The voice {model.name} is only the pointer of Git LFS, and fetching it failed")
    return TomVoice(
        model=model,
        length_scale=float(os.environ.get("LENGTH_SCALE", "1.0")),
        threads=int(os.environ.get("THREADS", "4")),
    )
