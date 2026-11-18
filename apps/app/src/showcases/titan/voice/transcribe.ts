// Which speech recognition the assistant page takes. With a transcription model at the gateway of
// the chat, such as the hub of the hackathon, the recording goes to it through the app's server
// (src/routes/(showcases)/titan.api.transcribe.ts): nothing to download, the key stays on the server. Without
// one, Whisper recognises it in the browser (whisper.ts).

import { loadWhisper, transcribe as transcribeInBrowser } from "./whisper.ts"

/** A name for the recording that tells the endpoint its format: it reads the ending, not the type. */
export function transcriptionFile(type: string): string {
  const format = type.split(";")[0].trim().toLowerCase()
  const ending: Record<string, string> = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
  }
  return `speech.${ending[format] ?? "webm"}`
}

let server: Promise<boolean> | undefined

/** Whether the app's server can transcribe. Asked once; a failed question is asked again. */
function serverTranscribes(): Promise<boolean> {
  server ??= fetch("/titan/api/transcribe")
    .then((answer) => (answer.ok ? answer.json() : { available: false }))
    .then((body: { available?: boolean }) => body.available === true)
  server.catch(() => {
    server = undefined
  })
  return server
}

/**
 * Gets the recognition ready. "server" when the endpoint transcribes; otherwise it loads Whisper and
 * `onProgress` gets a share between 0 and 1 while its files arrive.
 */
export async function loadRecognition(onProgress?: (share: number) => void): Promise<"server" | "browser"> {
  if (await serverTranscribes().catch(() => false)) return "server"
  await loadWhisper(onProgress)
  return "browser"
}

/** What was said in a recording, in German. */
export async function transcribe(recording: Blob): Promise<string> {
  if (!(await serverTranscribes().catch(() => false))) return transcribeInBrowser(recording)
  // Less than a few kilobytes is a tap of the key, not a question.
  if (recording.size < 2_000) return ""
  const answer = await fetch("/titan/api/transcribe", {
    method: "POST",
    headers: { "content-type": recording.type || "audio/webm" },
    body: recording,
  })
  const body = (await answer.json().catch(() => ({}))) as { text?: string; error?: string }
  if (!answer.ok) throw new Error(body.error ?? `HTTP ${answer.status}`)
  return body.text ?? ""
}
