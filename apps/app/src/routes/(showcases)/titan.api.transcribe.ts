import { createFileRoute } from "@tanstack/react-router"

// Titan's persona: the chat adds Titan's instructions to the questions asked on its screen.
import "@/showcases/titan/persona.server.ts"

import { dictationPrompt } from "@/chat/dictation.server.ts"
import { chatSettings } from "@/chat/gateway.ts"
import { transcriptionFile } from "@/showcases/titan/voice/transcribe.ts"

// Speech recognition for Titan: the browser sends a short recording, and gets back what was said, in
// one answer. It takes the model of the dictation in the chat (dictation.server.ts), the first one
// the gateway at LLM_BASE_URL marks for transcription, with the same key, which stays on the server.
// Without one, the page recognises speech in the browser instead.
//
// GET says whether there is one; POST takes a recording as its body and answers with { text }.

/** Titan, the words of the demo, and the names of the machines, so that they are written as the app writes them. */
async function prompt(): Promise<string> {
  const names = await dictationPrompt()
  return ["Hey Titan.", "Lagebild, Halle, Störung, Spindel, Pause.", names].filter(Boolean).join(" ")
}

async function transcribe({ request }: { request: Request }) {
  const settings = (await chatSettings()).dictation
  if (!settings) return Response.json({ error: "No transcription model at the gateway" }, { status: 503 })
  const recording = await request.blob()
  const form = new FormData()
  form.append("file", recording, transcriptionFile(recording.type || request.headers.get("content-type") || ""))
  form.append("model", settings.model)
  form.append("language", "de")
  form.append("prompt", await prompt())
  const answer = await fetch(`${settings.baseURL.replace(/\/+$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.apiKey}` },
    body: form,
  }).catch((error: unknown) => error as Error)
  if (answer instanceof Error) {
    const cause = (answer as { cause?: { code?: string } }).cause?.code
    return Response.json({ error: `The gateway cannot be reached (${cause ?? answer.message})` }, { status: 502 })
  }
  if (!answer.ok) return Response.json({ error: `The gateway answered ${answer.status}` }, { status: 502 })
  const { text } = (await answer.json()) as { text?: string }
  return Response.json({ text: (text ?? "").trim() })
}

export const Route = createFileRoute("/(showcases)/titan/api/transcribe")({
  server: {
    handlers: {
      GET: async () => Response.json({ available: (await chatSettings()).dictation !== undefined }),
      POST: transcribe,
    },
  },
})
