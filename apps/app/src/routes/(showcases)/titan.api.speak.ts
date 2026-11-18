import { createFileRoute } from "@tanstack/react-router"

import { readBodyText } from "@/chat/body.ts"
import { titanModels } from "@/showcases/titan/gateway.server.ts"
import { MAX_SENTENCE, speakableText } from "@/showcases/titan/voice/speech.ts"

// The voice of Titan: the speech model of the gateway of the chat turns a sentence into sound
// (POST <LLM_BASE_URL>/audio/speech, the speech endpoint of the OpenAI API). Which model that is, the
// gateway says: showcases/titan/gateway.server.ts. The key stays on the server.
//
// GET says whether there is one; POST takes JSON { text } and answers with audio/wav.

/** A gateway that offers several voices under one model wants a name; a model with one voice ignores it. */
const VOICE = "alloy"

async function speak({ request }: { request: Request }) {
  const models = await titanModels()
  if (!models?.speech) return Response.json({ error: "No speech model at the gateway" }, { status: 503 })
  // A sentence is at most MAX_SENTENCE characters; a body far over that did not come from the page.
  const sent = await readBodyText(request, 16 * 1024)
  let body: { text?: unknown } | undefined
  try {
    body = sent === null ? undefined : (JSON.parse(sent) as { text?: unknown })
  } catch {
    body = undefined
  }
  const text = speakableText(body?.text)
  if (text === undefined) {
    return Response.json({ error: `Send { text }, one sentence of at most ${MAX_SENTENCE} characters` }, { status: 400 })
  }
  const answer = await fetch(`${models.baseURL}/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${models.apiKey}` },
    body: JSON.stringify({ model: models.speech, input: text, voice: VOICE, response_format: "wav" }),
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
  }).catch((error: unknown) => error as Error)
  if (answer instanceof Error) {
    const cause = (answer as { cause?: { code?: string } }).cause?.code
    return Response.json({ error: `The gateway cannot be reached (${cause ?? answer.name})` }, { status: 502 })
  }
  if (!answer.ok) return Response.json({ error: `The gateway answered ${answer.status}` }, { status: 502 })
  return new Response(answer.body, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } })
}

export const Route = createFileRoute("/(showcases)/titan/api/speak")({
  server: {
    handlers: {
      GET: async () => Response.json({ available: (await titanModels())?.speech !== undefined }),
      POST: speak,
    },
  },
})
