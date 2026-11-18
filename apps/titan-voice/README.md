# titan-voice

Titan, the voice assistant of the example app, answers in the voice of Tom. This service makes that voice:
it takes one German sentence and answers with a wav, in a fraction of a second, on the CPU. It needs no
graphics card and no network.

It uses [Piper](https://github.com/OHF-voice/piper1-gpl) (GPL-3.0) with a voice trained on Tom's recording
alone: the training starts from the weights of a German Piper voice, so that it learns quickly, and then
learns only from Tom. No other voice speaks first, and nothing is converted or mixed.

| | |
|---|---|
| In the demo stack | `titan-voice` in `compose.yaml`. The port is not published: the app reaches it as `http://titan-voice:8080` (`TITAN_VOICE_URL`; set it empty to leave Titan with the voice of the browser) |
| Liveness | `GET /health`: `Healthy` once the voice is loaded and warm, `503` before |
| Speech | `POST /speak` with JSON `{ "text": "..." }`, one sentence, at most 1000 characters; answers `audio/wav`, mono, 16 bit, 22 050 Hz |
| Image | `pleiades.playground.titan.voice`, about 600 MB, the voice included |
| Settings | `THREADS` (4, from `TITAN_VOICE_THREADS`), `LENGTH_SCALE` (1.0, higher speaks slower), `VOICE` (`de_DE-tom-medium.onnx`) |

## Consent

Tom agreed that Titan speaks with his voice, and that his recording and the voice trained on it are kept in
this repository for that. Both are personal data: use them only for Titan in this demo. If Tom withdraws his
consent, delete `voice/` and `train/recording/`, remove them from the history of Git LFS, and remove the
service from `compose.yaml`.

## Files

- `voice/de_DE-tom-medium.onnx` and its `.json`: the voice of Tom, in Git LFS, built into the image.
- `train/recording/`: Tom's recording (`Stimmprofil_Tom.wav`, in Git LFS) and `metadata.csv`, the sentences
  cut from it with their text, as Whisper heard them and as the voice was trained.
- `Dockerfile`: Python 3.11, Piper and the voice.
- `voice.py`: loads the voice and speaks. `server.py`: the HTTP API, loading and warming up in the background.
- `train/`: the image to train the voice, `prepare.py`, which cuts the recording into sentences, and
  `train.py`, which runs Piper's training without a network.

Git LFS must be installed before you clone (`git lfs install`); without it, `voice/` holds only pointers and
the service reports `Unhealthy`. After a clone without it: `git lfs pull`.

## Run it

It starts with the stack:

```bash
docker compose up -d
docker compose ps titan-voice    # healthy once the voice is loaded and has spoken a first sentence
```

To hear it without the app:

```bash
docker compose exec titan-voice curl -s -X POST localhost:8080/speak \
  -H "Content-Type: application/json" -d '{"text":"Die Presse P-04 steht still."}' -o /tmp/probe.wav
docker compose cp titan-voice:/tmp/probe.wav ./probe.wav
```

## Train the voice again

`train/` is an image with Piper's training and Whisper. It needs an NVIDIA graphics card; on a laptop GPU
2000 epochs take about four hours. The more minutes of clear speech, the better the voice.

```bash
docker build -t pleiades.playground.titan.voice.train:local apps/titan-voice/train
W=/path/to/work                      # a folder outside the repository with a few GB free
mkdir -p $W/cache/ckpt $W/voice $W/run
# 1. cut the recording into sentences with their text (Whisper); needs the network once for Whisper
docker run --rm -v "$PWD/apps/titan-voice/train/recording:/data:ro" -v $W:/work/out -e HF_HOME=/work/out/cache/hf \
  pleiades.playground.titan.voice.train:local python prepare.py /data/Stimmprofil_Tom.wav /work/out/train
# 2. the German base voice to start from
curl -fL -o $W/cache/ckpt/thorsten-medium.ckpt \
  "https://huggingface.co/datasets/rhasspy/piper-checkpoints/resolve/main/de/de_DE/thorsten/medium/epoch%3D666-step%3D677672.ckpt"
# 3. learn Tom's voice, without a network
docker run --rm --network none --gpus all --shm-size 2g -v $W:/work/out pleiades.playground.titan.voice.train:local \
  python train.py fit --data.voice_name tom --model.mos_metric none \
  --data.csv_path /work/out/train/metadata.csv --data.audio_dir /work/out/train/wavs \
  --model.sample_rate 22050 --data.espeak_voice de --data.cache_dir /work/out/cache/piper \
  --data.config_path /work/out/voice/de_DE-tom-medium.onnx.json --data.batch_size 8 \
  --model.warmstart_ckpt /work/out/cache/ckpt/thorsten-medium.ckpt \
  --trainer.max_epochs 2000 --trainer.check_val_every_n_epoch 250 --trainer.default_root_dir /work/out/run
# 4. write the voice into the repository, then rebuild the image
docker run --rm --network none -v $W:/work/out pleiades.playground.titan.voice.train:local sh -c \
  'python -m piper.train.export_onnx --checkpoint "$(ls -t /work/out/run/lightning_logs/*/checkpoints/*.ckpt | head -1)" \
   --output-file /work/out/voice/de_DE-tom-medium.onnx'
cp $W/voice/de_DE-tom-medium.onnx* apps/titan-voice/voice/
docker compose up -d --build titan-voice
```

Read `$W/train/metadata.csv` after step 1: what Whisper misheard, correct there before step 3. To learn from
a further recording, cut it the same way, add its sentences, and start step 3 from the voice of Tom instead
of the base voice: `--model.warmstart_ckpt` with the last checkpoint of `$W/run`.

## In the app

`apps/app/src/routes/(showcases)/titan.api.speak.ts` passes a sentence on: `GET /titan/api/speak` says
`{ available }`, `POST /titan/api/speak` with `{ text }` answers the wav, `503` without `TITAN_VOICE_URL`. In
the browser, `apps/app/src/showcases/titan/voice/tom.ts` has `tomAvailable()`, `speakAsTom(sentence)` and `tom.predict(sentence)`, the
same shape as a Piper session, so the assistant plays Tom sentence by sentence. When the service does not
answer, the assistant falls back to Piper in the browser or the voice of the system.
