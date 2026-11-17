import { createFileRoute } from "@tanstack/react-router"

import { HUB_TRANSCRIBE_MODEL, transcriptionFile } from "@/voice/transcribe.ts"

// Speech recognition through the endpoint of the language model (LLM_BASE_URL), such as the hub of
// the hackathon: the browser sends what it recorded, and this asks the endpoint's transcription model.
// The key stays on the server. Without an endpoint, the page recognises speech in the browser instead.
//
// GET says whether it is there; POST takes a recording as its body and answers with { text }.

function endpoint() {
  const baseURL = process.env.LLM_BASE_URL
  if (!baseURL) return undefined
  return { baseURL, apiKey: process.env.LLM_API_KEY || "not-needed", model: process.env.TRANSCRIBE_MODEL || HUB_TRANSCRIBE_MODEL }
}

async function transcribe({ request }: { request: Request }) {
  const hub = endpoint()
  if (!hub) return Response.json({ error: "No endpoint for speech recognition configured" }, { status: 503 })
  const recording = await request.blob()
  const form = new FormData()
  form.append("file", recording, transcriptionFile(recording.type || request.headers.get("content-type") || ""))
  form.append("model", hub.model)
  form.append("language", "de")
  const answer = await fetch(`${hub.baseURL.replace(/\/$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${hub.apiKey}` },
    body: form,
  }).catch((error: unknown) => error as Error)
  if (answer instanceof Error) {
    const cause = (answer as { cause?: { code?: string } }).cause?.code
    return Response.json({ error: `The endpoint cannot be reached (${cause ?? answer.message})` }, { status: 502 })
  }
  if (!answer.ok) return Response.json({ error: `The endpoint answered ${answer.status}` }, { status: 502 })
  const { text } = (await answer.json()) as { text?: string }
  return Response.json({ text: (text ?? "").trim() })
}

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      GET: () => Response.json({ available: endpoint() !== undefined }),
      POST: transcribe,
    },
  },
})
