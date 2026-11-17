# titan-voice

Titan, the voice assistant of the example app, can answer in the voice of Tom. This service makes that
voice: it takes one German sentence and answers with a wav. It runs on this computer, on the CPU, and needs
no network once its image is built.

- [Piper](https://github.com/OHF-Voice/piper1-gpl) speaks the sentence with the German voice
  `de_DE-thorsten-medium` from [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices).
- The tone colour converter of [OpenVoice V2](https://github.com/myshell-ai/OpenVoice) (MIT, checkpoint
  [myshell-ai/OpenVoiceV2](https://huggingface.co/myshell-ai/OpenVoiceV2) `converter/`) then gives that
  speech the timbre of Tom. Only the converter is used: no whisper, no watermark model, nothing that is
  fetched at run time.

The words, the rhythm and the pronunciation stay those of Piper; the converter changes how the voice sounds.

| | |
|---|---|
| In the demo stack | not part of `compose.yaml`; added locally with `compose.override.yaml`, see below. The port is not published: the app reaches it as `http://titan-voice:8080` |
| Liveness | `GET /health`: `Healthy` once the models are loaded and warm, `503` before |
| Speech | `POST /speak` with JSON `{ "text": "..." }`, one sentence, at most 1000 characters; answers `audio/wav`, mono, 16 bit, 22 050 Hz |
| Image | `pleiades.playground.titan.voice` |
| Settings | `TORCH_THREADS` (4), `TAU` (0.3, how strongly the converter follows the source), `REFERENCE` (`Stimmprofil_Tom.mp4`) |

## Consent and the recording of Tom

Tom agreed that Titan speaks with his voice, and asked for it. His recording is personal data, and so are
the sound taken from it and the speaker embedding made of it. So:

- The recording is **not in this repository and not in the image**. It lives in `~/titan-voice/` on the
  computer that runs the service (on Windows `C:\Users\<you>\titan-voice\`), and the container mounts that
  folder at `/data`.
- At its first start the service takes the sound out of the recording with ffmpeg, in memory, cuts out long
  pauses, and computes the speaker embedding of Tom once. It keeps the embedding next to the recording, as
  `tom.se.pt` with `tom.se.json` (a fingerprint of the recording, to notice a new one). No wav is written.
- Nothing of it leaves the computer: not to a language model, not to any cloud. The service needs no network
  at run time, its port is not published, and the app only sends it the text to speak.
- Never commit the recording, a wav made from it or the embedding. If Tom withdraws his consent, delete the
  folder `~/titan-voice/` and remove the service from `compose.override.yaml`.

## Run it

1. Put the recording into the folder: `~/titan-voice/Stimmprofil_Tom.mp4`. A minute or more of clear
   speech, without music, is best.
2. The service takes about 1.1 GB of memory; give Docker Desktop 8 GB for the whole stack.
3. Add the service to your local, git-ignored `compose.override.yaml` next to `compose.yaml`, and tell the
   app where it is. Keep what is already in your file, and add:

   ```yaml
   services:
     app:
       environment:
         TITAN_VOICE_URL: http://titan-voice:8080

     titan-voice:
       image: ghcr.io/united-machining-solutions/pleiades.playground.titan.voice:${PLEIADES_VERSION:-dev}
       build:
         context: ./apps/titan-voice
       restart: unless-stopped
       cap_drop: [ALL]
       security_opt: ["no-new-privileges:true"]
       volumes:
         - ~/titan-voice:/data
       environment:
         TORCH_THREADS: ${TITAN_VOICE_THREADS:-4}
       healthcheck:
         test: ["CMD", "curl", "-fsS", "http://localhost:8080/health"]
         start_period: 120s
         interval: 10s
         timeout: 5s
         retries: 3
   ```

4. Build and start it, then the app again so it reads the new setting:

   ```bash
   docker compose build titan-voice
   docker compose up -d titan-voice app
   docker compose ps titan-voice    # healthy after half a minute or so
   ```

The build downloads about 600 MB (ffmpeg, torch for the CPU, Piper, the voice and the converter) once; the
image is about 2.5 GB.

To hear it without the app, publish nothing and ask from inside the stack:

```bash
docker compose exec titan-voice curl -s -X POST localhost:8080/speak \
  -H "Content-Type: application/json" -d '{"text":"Die Presse P-04 steht still."}' -o /tmp/probe.wav
docker compose cp titan-voice:/tmp/probe.wav ~/probe.wav   # outside the repository
```

## In the app

`apps/app/src/routes/api/speak.ts` passes a sentence on: `GET /api/speak` says `{ available }`, `POST
/api/speak` with `{ text }` answers the wav, `503` without `TITAN_VOICE_URL`. In the browser,
`apps/app/src/voice/tom.ts` has `tomAvailable()`, `speakAsTom(sentence)` and `tom.predict(sentence)`, the
same shape as a Piper session, so the assistant plays Tom sentence by sentence like Piper.

## Speed

Measured on a laptop CPU (Intel Core Ultra 7 265U, Docker with 8 GB, four threads): a sentence of twelve
words, about 4.4 seconds of speech, takes about 4.3 seconds, so the voice is made about as fast as it is
spoken. Piper needs a quarter of a second of that; the decoder of the converter takes most of the rest. More
threads, ONNX Runtime for the decoder or decoding in parallel pieces gained nothing worth the complexity on
this CPU. The first sentence is heard after about four seconds; while it plays, the next is made. The
service makes one sentence at a time and takes about 1.1 GB of memory. It is ready six seconds after it
starts (nine the first time, when it computes Tom's embedding).

## Files

- `Dockerfile`: Python 3.11, ffmpeg, torch for the CPU, Piper, OpenVoice without its dependencies, and the
  model files from Hugging Face at pinned revisions.
- `voice.py`: Piper, the converter, the embeddings.
- `server.py`: the HTTP API, loading and warming up in the background.
