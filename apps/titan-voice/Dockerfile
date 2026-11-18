# The voice of Titan: German text in, a wav in the voice of Tom out, by Piper on the CPU.
#
# The voice of Tom, trained with train/ from his recording, is in voice/ and goes into the image.
FROM python:3.11-slim-bookworm

ARG PIPER_VERSION=1.3.0

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*
RUN pip install "piper-tts==${PIPER_VERSION}"

RUN useradd --create-home --uid 10001 titan
WORKDIR /app
COPY server.py voice.py ./
COPY voice/ ./voice/

ENV DATA_DIR=/app/voice \
    VOICE=de_DE-tom-medium.onnx \
    THREADS=4
USER titan
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://localhost:8080/health || exit 1
CMD ["python", "server.py"]
