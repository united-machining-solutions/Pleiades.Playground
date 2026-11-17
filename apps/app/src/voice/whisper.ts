// Speech recognition that runs in the browser, with no server: Whisper through transformers.js.
//
// The first time, the browser downloads the model from huggingface.co and the runtime from
// cdn.jsdelivr.net, and keeps both in its cache. From then on it recognises speech without a network,
// in the WLAN of the hub too. Load it once while there is internet.

/** A small multilingual Whisper, quantised to 8 bits: about 80 MB, good enough for German questions. */
export const WHISPER_MODEL = "onnx-community/whisper-base"

/** Whisper hears at 16 kHz. */
const SAMPLE_RATE = 16_000

type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string } | Array<{ text: string }>>

let loading: Promise<Transcriber> | undefined

/**
 * Loads the model, from the cache of the browser if it is there. `onProgress` gets a share between 0
 * and 1 while files arrive. Called again, it returns the same promise.
 */
export function loadWhisper(onProgress?: (share: number) => void): Promise<Transcriber> {
  loading ??= (async () => {
    const { pipeline } = await import("@huggingface/transformers")
    const files = new Map<string, { loaded: number; total: number }>()
    const transcriber = await pipeline("automatic-speech-recognition", WHISPER_MODEL, {
      device: "wasm",
      dtype: "q8",
      progress_callback: (event: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (event.status !== "progress" || !event.file || !event.total) return
        files.set(event.file, { loaded: event.loaded ?? 0, total: event.total })
        const all = [...files.values()].reduce((sum, one) => ({ loaded: sum.loaded + one.loaded, total: sum.total + one.total }), { loaded: 0, total: 0 })
        onProgress?.(all.total > 0 ? all.loaded / all.total : 0)
      },
    })
    return transcriber as unknown as Transcriber
  })()
  // A failed load may be tried again, for example once the network is back.
  loading.catch(() => {
    loading = undefined
  })
  return loading
}

/** Audio as the browser recorded it, as Whisper hears it: one channel at 16 kHz. */
async function samplesOf(recording: Blob): Promise<Float32Array> {
  const context = new AudioContext({ sampleRate: SAMPLE_RATE })
  try {
    const decoded = await context.decodeAudioData(await recording.arrayBuffer())
    return decoded.getChannelData(0)
  } finally {
    void context.close()
  }
}

/** What was said in a recording, in German. */
export async function transcribe(recording: Blob): Promise<string> {
  const [transcriber, samples] = await Promise.all([loadWhisper(), samplesOf(recording)])
  // Less than a quarter of a second is a tap of the key, not a question.
  if (samples.length < SAMPLE_RATE / 4) return ""
  const result = await transcriber(samples, { language: "german", task: "transcribe" })
  const text = Array.isArray(result) ? result.map((one) => one.text).join(" ") : result.text
  return text.trim()
}
