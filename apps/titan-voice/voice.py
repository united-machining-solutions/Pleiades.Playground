"""German speech in the voice of Tom: Piper speaks, OpenVoice V2 gives it Tom's timbre.

Piper (de_DE-thorsten) turns the text into speech quickly. The tone colour converter of OpenVoice V2 then
swaps the timbre of that speech, from the speaker embedding of Piper's voice to the one of Tom. Tom's
embedding is taken once from his reference recording and kept next to it, in DATA_DIR; the recording, its
sound and the embedding never leave this computer and are never written anywhere else.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import subprocess
import wave
from pathlib import Path

import numpy as np
import torch
from openvoice import utils as ov_utils
from openvoice.models import SynthesizerTrn
from piper import PiperVoice

log = logging.getLogger("titan-voice")

# The converter works on 10-second pieces of the reference, like OpenVoice's own extractor, and takes the
# mean: one embedding over minutes would mostly hear the end.
PIECE_SECONDS = 10.0
MIN_PIECE_SECONDS = 2.0

# Sentences Piper speaks to learn its own timbre, the source of the conversion. Not personal.
SOURCE_SENTENCES = [
    "Guten Morgen, die Anlage läuft seit sechs Uhr ohne Unterbrechung.",
    "Die Presse P-04 steht still, weil die Schutztür geöffnet wurde.",
    "Bitte prüfen Sie den Druck im Hydraulikkreis, bevor Sie neu starten.",
    "Heute wurden bisher dreihundertzwölf Teile gefertigt, davon vier Ausschuss.",
]


def spectrogram(y: torch.Tensor, n_fft: int, hop: int, win: int) -> torch.Tensor:
    """The linear spectrogram the converter expects; spectrogram_torch of OpenVoice (MIT), without librosa."""
    pad = int((n_fft - hop) / 2)
    y = torch.nn.functional.pad(y.unsqueeze(1), (pad, pad), mode="reflect").squeeze(1)
    spec = torch.stft(
        y,
        n_fft,
        hop_length=hop,
        win_length=win,
        window=torch.hann_window(win, dtype=y.dtype),
        center=False,
        pad_mode="reflect",
        normalized=False,
        onesided=True,
        return_complex=True,
    )
    return torch.sqrt(spec.real.pow(2) + spec.imag.pow(2) + 1e-6)


def resample(audio: np.ndarray, source_rate: int, target_rate: int) -> np.ndarray:
    if source_rate == target_rate:
        return audio
    length = int(round(len(audio) * target_rate / source_rate))
    return np.interp(np.linspace(0, len(audio) - 1, length), np.arange(len(audio)), audio).astype(np.float32)


def to_wav(audio: np.ndarray, rate: int) -> bytes:
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > 0.98:
        audio = audio * (0.98 / peak)
    pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2")
    out = io.BytesIO()
    with wave.open(out, "wb") as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(rate)
        file.writeframes(pcm.tobytes())
    return out.getvalue()


class TomVoice:
    def __init__(self, models_dir: Path, data_dir: Path, reference: str, tau: float) -> None:
        self.tau = tau
        self.piper = PiperVoice.load(str(models_dir / "piper.onnx"), config_path=str(models_dir / "piper.onnx.json"))
        self.piper_rate = int(self.piper.config.sample_rate)

        hps = ov_utils.get_hparams_from_file(str(models_dir / "converter.json"))
        model = SynthesizerTrn(
            len(getattr(hps, "symbols", [])),
            hps.data.filter_length // 2 + 1,
            n_speakers=hps.data.n_speakers,
            **hps.model,
        )
        checkpoint = torch.load(str(models_dir / "converter.pth"), map_location="cpu", weights_only=True)
        model.load_state_dict(checkpoint["model"], strict=False)
        model.eval()
        self.model = model
        self.hps = hps
        self.rate = int(hps.data.sampling_rate)

        self.source_se = self._embedding([self._piper_audio(sentence) for sentence in SOURCE_SENTENCES])
        self.target_se = self._tom_embedding(data_dir, reference)

    # -- Piper -----------------------------------------------------------------------------------------

    def _piper_audio(self, text: str) -> np.ndarray:
        pieces = [chunk.audio_float_array for chunk in self.piper.synthesize(text)]
        audio = np.concatenate(pieces).astype(np.float32) if pieces else np.zeros(0, dtype=np.float32)
        return resample(audio, self.piper_rate, self.rate)

    # -- Embeddings ------------------------------------------------------------------------------------

    def _spec(self, audio: np.ndarray) -> torch.Tensor:
        d = self.hps.data
        return spectrogram(torch.from_numpy(audio).float().unsqueeze(0), d.filter_length, d.hop_length, d.win_length)

    @torch.inference_mode()
    def _embedding(self, audios: list[np.ndarray]) -> torch.Tensor:
        embeddings = []
        for audio in audios:
            embeddings.append(self.model.ref_enc(self._spec(audio).transpose(1, 2)).unsqueeze(-1))
        return torch.stack(embeddings).mean(0)

    def _tom_embedding(self, data_dir: Path, reference: str) -> torch.Tensor:
        source = data_dir / reference
        cache = data_dir / "tom.se.pt"
        stamp = data_dir / "tom.se.json"
        if not source.is_file():
            raise FileNotFoundError(f"The reference recording {reference} is not in {data_dir}")
        fingerprint = _fingerprint(source)
        if cache.is_file() and stamp.is_file():
            try:
                if json.loads(stamp.read_text())["source"] == fingerprint:
                    log.info("Speaker embedding of Tom taken from the cache")
                    return torch.load(str(cache), map_location="cpu", weights_only=True)
            except (ValueError, KeyError, OSError):
                pass
        log.info("Taking the speaker embedding of Tom from the reference, once")
        audio = _reference_audio(source, self.rate)
        piece = int(PIECE_SECONDS * self.rate)
        pieces = [audio[i : i + piece] for i in range(0, len(audio), piece)]
        pieces = [p for p in pieces if len(p) >= MIN_PIECE_SECONDS * self.rate]
        if not pieces:
            raise ValueError("The reference recording has less than two seconds of speech")
        se = self._embedding(pieces)
        torch.save(se, str(cache))
        stamp.write_text(json.dumps({"source": fingerprint, "pieces": len(pieces), "seconds": round(len(audio) / self.rate, 1)}))
        log.info("Speaker embedding of Tom cached from %d pieces (%.0f s of speech)", len(pieces), len(audio) / self.rate)
        return se

    # -- Speech ----------------------------------------------------------------------------------------

    @torch.inference_mode()
    def speak(self, text: str) -> bytes:
        audio = self._piper_audio(text)
        if audio.size == 0:
            return to_wav(audio, self.rate)
        spec = self._spec(audio)
        lengths = torch.LongTensor([spec.size(-1)])
        converted = self.model.voice_conversion(spec, lengths, sid_src=self.source_se, sid_tgt=self.target_se, tau=self.tau)
        return to_wav(converted[0][0, 0].float().numpy(), self.rate)


def _fingerprint(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def _reference_audio(path: Path, rate: int) -> np.ndarray:
    """The speech of the reference, mono at the converter's rate, with hum and long pauses taken out.

    ffmpeg writes raw samples to a pipe: the sound of the recording is never written to a file.
    """
    result = subprocess.run(
        [
            "ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", str(rate),
            "-af", "highpass=f=70,silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:stop_duration=0.4:stop_threshold=-45dB",
            "-f", "f32le", "-",
        ],
        check=True,
        capture_output=True,
    )
    return np.frombuffer(result.stdout, dtype="<f4").copy()


def from_environment() -> TomVoice:
    threads = int(os.environ.get("TORCH_THREADS", "4"))
    torch.set_num_threads(threads)
    torch.set_num_interop_threads(1)
    return TomVoice(
        models_dir=Path(os.environ.get("MODELS_DIR", "/models")),
        data_dir=Path(os.environ.get("DATA_DIR", "/data")),
        reference=os.environ.get("REFERENCE", "Stimmprofil_Tom.mp4"),
        tau=float(os.environ.get("TAU", "0.3")),
    )
