# The voice of Titan: German text in, a wav in the voice of Tom out. CPU only.
#
# Every model is fetched here, at build time, so that the container starts without a network. The
# reference recording of Tom is not in the image: it is mounted at /data, see README.md.
FROM python:3.11-slim-bookworm

ARG TORCH_VERSION=2.5.1
ARG PIPER_VERSION=1.8.0
# A commit of github.com/myshell-ai/OpenVoice (MIT), and revisions of the two model repositories on
# Hugging Face, so that a build next month fetches the same.
ARG OPENVOICE_COMMIT=74a1d147b17a8c3092dd5430504bd83ef6c7eb23
ARG OPENVOICE_V2_REVISION=f36e7edfe1684461a8343844af60babc2efbb727
ARG PIPER_VOICES_REVISION=0ca208afc2a2ee102b1e961e72e0a7e4907be3d0
ARG PIPER_VOICE=de_DE-thorsten-medium

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# ffmpeg takes the sound out of the reference video.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg curl \
 && rm -rf /var/lib/apt/lists/*

# torch for the CPU only (no CUDA, about 200 MB instead of 2 GB). OpenVoice without its dependencies:
# the tone colour converter needs only torch and numpy; the rest (whisper, gradio, wavmark) is not used.
ENV PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10
RUN pip install --index-url https://download.pytorch.org/whl/cpu "torch==${TORCH_VERSION}"
RUN pip install "piper-tts==${PIPER_VERSION}" numpy
RUN pip install --no-deps "https://github.com/myshell-ai/OpenVoice/archive/${OPENVOICE_COMMIT}.zip"

WORKDIR /models
RUN set -eu; \
    hf=https://huggingface.co; \
    voice_dir="$(echo "$PIPER_VOICE" | sed -E 's/^([a-z]+)_([A-Z]+)-([^-]+)-([a-z_]+)$/\1\/\1_\2\/\3\/\4/')"; \
    curl -fsSL --retry 5 --retry-all-errors -o piper.onnx "$hf/rhasspy/piper-voices/resolve/${PIPER_VOICES_REVISION}/${voice_dir}/${PIPER_VOICE}.onnx"; \
    curl -fsSL --retry 5 --retry-all-errors -o piper.onnx.json "$hf/rhasspy/piper-voices/resolve/${PIPER_VOICES_REVISION}/${voice_dir}/${PIPER_VOICE}.onnx.json"; \
    curl -fsSL --retry 5 --retry-all-errors -o converter.json "$hf/myshell-ai/OpenVoiceV2/resolve/${OPENVOICE_V2_REVISION}/converter/config.json"; \
    curl -fsSL --retry 5 --retry-all-errors -o converter.pth "$hf/myshell-ai/OpenVoiceV2/resolve/${OPENVOICE_V2_REVISION}/converter/checkpoint.pth"; \
    ls -l /models

RUN useradd --create-home --uid 10001 titan
WORKDIR /app
COPY server.py voice.py ./

ENV MODELS_DIR=/models \
    DATA_DIR=/data \
    REFERENCE=Stimmprofil_Tom.mp4 \
    TORCH_THREADS=4 \
    HF_HUB_OFFLINE=1
USER titan
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=120s --retries=3 \
  CMD curl -fsS http://localhost:8080/health || exit 1
CMD ["python", "server.py"]
