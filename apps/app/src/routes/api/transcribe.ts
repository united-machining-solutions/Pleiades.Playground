import { generateTranscription, generationParamsFromRequest, toServerSentEventsResponse } from "@tanstack/ai"
import { createFileRoute } from "@tanstack/react-router"

import { dictationAdapter } from "@/chat/dictation.server.ts"

// The browser sends a recording from the chat field, and gets back what was said in it, as text.
async function transcribe({ request }: { request: Request }) {
  const adapter = dictationAdapter()
  if (!adapter) return Response.json({ error: "No transcription model configured" }, { status: 503 })
  const { input, threadId, runId } = await generationParamsFromRequest("transcription", request)
  const stream = generateTranscription({
    adapter,
    threadId,
    runId,
    audio: input.audio,
    language: input.language,
    stream: true,
  })
  return toServerSentEventsResponse(stream)
}

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: { POST: transcribe },
  },
})
