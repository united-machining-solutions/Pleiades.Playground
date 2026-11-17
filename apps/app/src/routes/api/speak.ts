import { createFileRoute } from "@tanstack/react-router"

import { MAX_SENTENCE, speakableText } from "@/voice/tom.ts"

// The voice of Tom for Titan: a service on this computer (TITAN_VOICE_URL, see apps/titan-voice) turns a
// sentence into a wav. The browser does not reach it directly; this passes the sentence on.
//
// GET says whether it is there and ready; POST takes JSON { text } and answers with audio/wav.

function serviceUrl() {
  const url = process.env.TITAN_VOICE_URL
  return url ? url.replace(/\/$/, "") : undefined
}

async function available() {
  const url = serviceUrl()
  if (!url) return false
  const answer = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) }).catch(() => undefined)
  return answer?.ok === true
}

async function speak({ request }: { request: Request }) {
  const url = serviceUrl()
  if (!url) return Response.json({ error: "No voice of Tom configured (TITAN_VOICE_URL)" }, { status: 503 })
  const body = (await request.json().catch(() => undefined)) as { text?: unknown } | undefined
  const text = speakableText(body?.text)
  if (text === undefined) {
    return Response.json({ error: `Send { text }, one sentence of at most ${MAX_SENTENCE} characters` }, { status: 400 })
  }
  const answer = await fetch(`${url}/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(60_000),
  }).catch((error: unknown) => error as Error)
  if (answer instanceof Error) {
    const cause = (answer as { cause?: { code?: string } }).cause?.code
    return Response.json({ error: `The voice of Tom cannot be reached (${cause ?? answer.message})` }, { status: 502 })
  }
  if (!answer.ok) return Response.json({ error: `The voice of Tom answered ${answer.status}` }, { status: 502 })
  return new Response(answer.body, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } })
}

export const Route = createFileRoute("/api/speak")({
  server: {
    handlers: {
      GET: async () => Response.json({ available: await available() }),
      POST: speak,
    },
  },
})
