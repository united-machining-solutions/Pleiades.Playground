"""The voice of Tom from Git LFS, when a checkout has only its pointer.

The voice is in Git LFS. A checkout without it, as a check of the continuous integration or a clone without
`git lfs`, has a small text file in its place, the pointer, which names the file by its SHA-256 and size.
This asks the server of Git LFS of the repository for the file of that pointer, checks it against the SHA-256
and the size, and puts it where the pointer was, or where it is told to.

It never fails: without a network, or for any other reason, it says why and leaves the pointer. Then the
service starts all the same, healthy, and the app speaks with the voice of the browser.

    python lfs.py voice/de_DE-tom-medium.onnx     (the build runs it)
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import sys
import urllib.request
from pathlib import Path

log = logging.getLogger("titan-voice")

POINTER = b"version https://git-lfs.github.com/spec/v1"
REPOSITORY = os.environ.get("LFS_REPOSITORY", "https://github.com/united-machining-solutions/Pleiades.Playground.git")
TIMEOUT = 60


def is_pointer(path: Path) -> bool:
    """Whether a file is the pointer of Git LFS and not the file itself."""
    try:
        with path.open("rb") as file:
            return file.read(len(POINTER)) == POINTER
    except OSError:
        return False


def pointer_of(path: Path) -> tuple[str, int]:
    """The SHA-256 and the size a pointer names."""
    fields = dict(line.split(" ", 1) for line in path.read_text().splitlines() if " " in line)
    return fields["oid"].removeprefix("sha256:"), int(fields["size"])


def fetch(path: Path, target: Path | None = None) -> bool:
    """Puts the file a pointer names at `target`, the pointer's own place if none. True if it is there."""
    target = target or path
    if not is_pointer(path):
        return True
    try:
        oid, size = pointer_of(path)
        ask = urllib.request.Request(
            f"{REPOSITORY.rstrip('/')}/info/lfs/objects/batch",
            data=json.dumps({"operation": "download", "transfers": ["basic"], "objects": [{"oid": oid, "size": size}]}).encode(),
            headers={"Accept": "application/vnd.git-lfs+json", "Content-Type": "application/vnd.git-lfs+json"},
        )
        with urllib.request.urlopen(ask, timeout=TIMEOUT) as answer:
            found = json.load(answer)["objects"][0]
        download = found["actions"]["download"]
        with urllib.request.urlopen(urllib.request.Request(download["href"], headers=download.get("header", {})), timeout=TIMEOUT) as answer:
            data = answer.read()
        if len(data) != size or hashlib.sha256(data).hexdigest() != oid:
            raise ValueError("the file from Git LFS is not the one the pointer names")
        target.parent.mkdir(parents=True, exist_ok=True)
        part = target.with_suffix(target.suffix + ".part")
        part.write_bytes(data)
        part.replace(target)
        log.info("Fetched %s from Git LFS, %d bytes", target.name, size)
        return True
    except Exception as error:  # noqa: BLE001 - never fails, says why
        log.warning("The voice of Tom is only the pointer of Git LFS, and fetching it failed (%s: %s)", type(error).__name__, error)
        return False


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    for name in sys.argv[1:]:
        fetch(Path(name))
