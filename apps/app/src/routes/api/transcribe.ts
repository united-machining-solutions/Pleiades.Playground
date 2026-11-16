import { generateTranscription, generationParamsFromRequest, toServerSentEventsResponse } from "@tanstack/ai"
import { createFileRoute } from "@tanstack/react-router"

import { dictationAdapter, dictationPrompt } from "@/chat/dictation.server.ts"

// The browser sends a recording from the chat field, and gets back what was said in it, as text.
async function transcribe({ request }: { request: Request }) {
  const adapter = dictationAdapter()
  if (!adapter) return Response.json({ error: "No transcription model configured" }, { status: 503 })
  // The names of the machines are read while the recording is unpacked.
  const [{ input, threadId, runId }, prompt] = await Promise.all([
    generationParamsFromRequest("transcription", request),
    dictationPrompt(),
  ])
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
