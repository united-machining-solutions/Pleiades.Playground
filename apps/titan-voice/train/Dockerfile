# Trains a Piper voice of Tom from his recording: prepare.py cuts it into sentences, piper.train learns
# them on an NVIDIA graphics card, export_onnx writes the voice. Not part of the stack; run by hand, see
# ../README.md. The recording is in recording/, mounted at /data; the work goes to a folder of your choice.
FROM python:3.11-slim-bookworm

ARG TORCH_VERSION=2.6.0
ARG PIPER_COMMIT=main

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg git build-essential cmake ninja-build curl \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --index-url https://download.pytorch.org/whl/cu124 "torch==${TORCH_VERSION}" "torchaudio==${TORCH_VERSION}"

# Piper with its training extras, built from source (the espeak-ng bridge and monotonic alignment).
WORKDIR /opt
RUN git clone https://github.com/OHF-voice/piper1-gpl.git piper \
 && cd piper && git checkout "${PIPER_COMMIT}" \
 && pip install scikit-build "cmake<4" ninja \
 && pip install -e '.[train]' \
 && ./build_monotonic_align.sh \
 && python setup.py build_ext --inplace

# Whisper, to write down what is said in the recording.
RUN pip install "faster-whisper>=1.1,<2"

ENV HF_HOME=/cache/hf
WORKDIR /work
COPY prepare.py train.py ./
