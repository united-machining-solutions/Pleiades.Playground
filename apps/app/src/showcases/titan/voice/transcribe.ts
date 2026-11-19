// The speech recognition of Titan: the recording goes to the transcription model of the gateway of the
// chat, through the app's server (src/routes/(showcases)/titan.api.transcribe.ts). Nothing is downloaded
// and the key stays on the server. Without such a model Titan cannot listen, as the chat field then has
// no microphone.

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

/** Whether Titan can listen: resolves if the gateway has a transcription model, rejects with why not. */
export async function loadRecognition(): Promise<void> {
  if (!(await serverTranscribes().catch(() => false))) throw new Error("Das Gateway hat kein Modell für Spracherkennung.")
}

/** What was said in a recording, in German. */
export async function transcribe(recording: Blob): Promise<string> {
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
