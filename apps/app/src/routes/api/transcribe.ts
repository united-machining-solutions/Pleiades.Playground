import { generateTranscription, generationParamsFromBody, toServerSentEventsResponse } from "@tanstack/ai"
import { createFileRoute } from "@tanstack/react-router"

import { readBodyText } from "@/chat/body.ts"
import { dictationAdapter, dictationPrompt } from "@/chat/dictation.server.ts"

// The browser sends a recording from the chat field, and gets back what was said in it, as text.
async function transcribe({ request }: { request: Request }) {
  const adapter = dictationAdapter()
  if (!adapter) return Response.json({ error: "No transcription model configured" }, { status: 503 })
  // The button stops after two minutes, a few megabytes; a body over the limit did not come from it.
  const text = await readBodyText(request)
  if (text === null) return Response.json({ error: "The recording is too large" }, { status: 413 })
  const { input, threadId, runId } = generationParamsFromBody("transcription", JSON.parse(text))
  const prompt = await dictationPrompt()
  const stream = generateTranscription({
    adapter,
    threadId,
    runId,
    audio: input.audio,
    language: input.language,
    ...(prompt !== undefined && { prompt }),
    stream: true,
  })
  return toServerSentEventsResponse(stream)
}

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: { POST: transcribe },
  },
})
