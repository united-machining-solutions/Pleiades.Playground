"""HTTP for the voice of Titan.

GET  /health  200 while the service runs, with the voice of Tom or without it: the stack starts healthy
              wherever it runs. The text says whether the voice is there, loading, or missing and why.
GET  /ready   200 once the voice of Tom is loaded and warm, 503 before or without it. The app asks this.
POST /speak   JSON {"text": "..."}, one sentence at a time, answers audio/wav (mono, 16 bit, 22050 Hz),
              503 without the voice: the app then speaks with the voice of the browser.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("titan-voice")

MAX_TEXT = 1000
MAX_BODY = 16 * 1024

state: dict[str, object] = {"voice": None, "error": None}
# One synthesis at a time: Piper already uses the threads it is given, two at once only slow each other.
speaking = threading.Lock()


def load() -> None:
    started = time.monotonic()
    try:
        from voice import from_environment

        voice = from_environment()
        warm = time.monotonic()
        voice.speak("Hallo, hier spricht Titan.")
        log.info("Warmed up in %.2f s", time.monotonic() - warm)
        state["voice"] = voice
        log.info("Ready after %.1f s", time.monotonic() - started)
    except Exception as error:  # noqa: BLE001 - the health check reports it
        state["error"] = f"{type(error).__name__}: {error}"
        log.exception("Loading failed")


class Handler(BaseHTTPRequestHandler):
    server_version = "titan-voice"

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - signature of the base class
        pass

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _text(self, status: int, text: str) -> None:
        self._send(status, text.encode(), "text/plain; charset=utf-8")

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            if state["voice"] is not None:
                return self._text(HTTPStatus.OK, "Healthy")
            if state["error"] is not None:
                return self._text(HTTPStatus.OK, f"Healthy, without the voice of Tom: {state['error']}")
            return self._text(HTTPStatus.OK, "Healthy, loading the voice of Tom")
        if self.path == "/ready":
            if state["voice"] is not None:
                return self._text(HTTPStatus.OK, "Ready")
            return self._text(HTTPStatus.SERVICE_UNAVAILABLE, f"Without the voice of Tom: {state['error']}" if state["error"] else "Loading")
        return self._text(HTTPStatus.NOT_FOUND, "Not found")

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/speak":
            return self._text(HTTPStatus.NOT_FOUND, "Not found")
        voice = state["voice"]
        if voice is None:
            return self._text(HTTPStatus.SERVICE_UNAVAILABLE, f"Without the voice of Tom: {state['error']}" if state["error"] else "Loading")
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self._text(HTTPStatus.BAD_REQUEST, "Send JSON {\"text\": \"...\"}")
        try:
            text = json.loads(self.rfile.read(length)).get("text")
        except (ValueError, AttributeError):
            text = None
        if not isinstance(text, str) or not text.strip():
            return self._text(HTTPStatus.BAD_REQUEST, "Send JSON {\"text\": \"...\"}")
        if len(text) > MAX_TEXT:
            return self._text(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, f"At most {MAX_TEXT} characters, one sentence at a time")
        started = time.monotonic()
        with speaking:
            wav = voice.speak(text.strip())  # type: ignore[attr-defined]
        log.info("Spoke %d words in %.2f s", len(text.split()), time.monotonic() - started)
        self._send(HTTPStatus.OK, wav, "audio/wav")


def main() -> None:
    port = int(os.environ.get("PORT", "8080"))
    threading.Thread(target=load, daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    log.info("Listening on %d", port)
    server.serve_forever()


if __name__ == "__main__":
    main()
