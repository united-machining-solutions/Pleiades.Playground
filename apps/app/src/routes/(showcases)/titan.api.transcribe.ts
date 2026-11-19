import { createFileRoute } from "@tanstack/react-router"

import { dictationPrompt } from "@/chat/dictation.server.ts"
import { chatSettings } from "@/chat/gateway.ts"
import { transcriptionFile } from "@/showcases/titan/voice/transcribe.ts"

// Speech recognition for Titan: the browser sends a short recording, and gets back what was said, in
// one answer. It takes the model of the dictation in the chat (dictation.server.ts), the first one
// the gateway at LLM_BASE_URL marks for transcription, with the same key, which stays on the server.
// Without one Titan cannot listen.
//
// GET says whether there is one; POST takes a recording as its body and answers with { text }.

/** Titan, the words of the demo, and the names of the machines, so that they are written as the app writes them. */
async function prompt(): Promise<string> {
  const names = await dictationPrompt()
  return ["Hey Titan.", "Lagebild, Halle, Störung, Spindel, Pause.", names].filter(Boolean).join(" ")
}

/**
 * The largest recording the route takes. A question is a few seconds, and "Hey Titan" cuts a piece after
 * eight, a quarter of a megabyte as a wav of 16 kHz; the space bar ends a recording after a minute, two megabytes. Anything over this did not come from the page.
 */
const MOST_BYTES = 4 * 1024 * 1024

/** The body as bytes, or null once it is bigger than the limit: a large upload is never held in memory. */
async function recordingOf(request: Request): Promise<Uint8Array<ArrayBuffer> | null> {
  if (Number(request.headers.get("content-length") ?? 0) > MOST_BYTES) return null
  if (!request.body) return new Uint8Array(0)
  const reader = request.body.getReader()
  const chunks: Array<Uint8Array> = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MOST_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.byteLength
  }
  return bytes
}

async function transcribe({ request }: { request: Request }) {
  const settings = (await chatSettings()).dictation
  if (!settings) return Response.json({ error: "No transcription model at the gateway" }, { status: 503 })
  const bytes = await recordingOf(request)
  if (bytes === null) return Response.json({ error: "The recording is too large" }, { status: 413 })
  const type = (request.headers.get("content-type") ?? "").split(";")[0]?.trim() || "audio/webm"
  const recording = new Blob([bytes], { type })
  const form = new FormData()
  form.append("file", recording, transcriptionFile(type))
  form.append("model", settings.model)
  form.append("language", "de")
  form.append("prompt", await prompt())
  const answer = await fetch(`${settings.baseURL.replace(/\/+$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.apiKey}` },
    body: form,
    // The browser hung up, or the gateway takes too long: the request to the gateway ends too.
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
  }).catch((error: unknown) => error as Error)
  if (answer instanceof Error) {
    const cause = (answer as { cause?: { code?: string } }).cause?.code
    return Response.json({ error: `The gateway cannot be reached (${cause ?? answer.name})` }, { status: 502 })
  }
  // A recording the model cannot read, too short or of no format it knows, is answered with 400: nothing
  // was understood, which the page says in its own words. Every other refusal is the gateway's.
  // The log keeps why: a gateway also answers 400 for a model it does not know, and that must not hide.
  if (answer.status === 400) {
    console.warn("Titan: the transcription model refused a recording (400):", (await answer.text().catch(() => "")).slice(0, 500))
    return Response.json({ text: "" })
  }
  if (!answer.ok) return Response.json({ error: `The gateway answered ${answer.status}` }, { status: 502 })
  const body = (await answer.json().catch(() => undefined)) as { text?: unknown } | undefined
  if (body === undefined) return Response.json({ error: "The gateway did not answer with JSON" }, { status: 502 })
  return Response.json({ text: typeof body.text === "string" ? body.text.trim() : "" })
}

export const Route = createFileRoute("/(showcases)/titan/api/transcribe")({
  server: {
    handlers: {
      GET: async () => Response.json({ available: (await chatSettings()).dictation !== undefined }),
      POST: transcribe,
    },
  },
})
