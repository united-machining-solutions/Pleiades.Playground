import { generateTranscription, generationParamsFromBody, toServerSentEventsResponse } from "@tanstack/ai"
import { createFileRoute } from "@tanstack/react-router"

import { readBodyText } from "@/chat/body.ts"
import { dictationAdapter, dictationPrompt } from "@/chat/dictation.server.ts"

// The browser sends a recording from the chat field, and gets back what was said in it, as text. With
// `?draft` it is what was said so far while the recording runs (chat/dictation-draft.ts).

/**
 * The gateway takes two requests of a key at once, and every field of the app shares the key. So the app
 * writes one draft at a time, for all its fields together: drafts never take more than one of the two,
 * and the other stays for the chat and for whole recordings. A draft that finds one on its way is turned
 * away at once; its field asks again two seconds later.
 */
let drafting = false
/** A draft that never says it is done does not hold the others back longer than this. */
const DRAFT_HELD_MS = 30_000

async function transcribe({ request }: { request: Request }) {
  const adapter = await dictationAdapter()
  if (!adapter) return Response.json({ error: "No transcription model configured" }, { status: 503 })
  const draft = new URL(request.url).searchParams.has("draft")
  if (draft && drafting) return Response.json({ error: "Another draft is being written" }, { status: 429 })
  // The button stops after two minutes, a few megabytes; a body over the limit did not come from it.
  const text = await readBodyText(request)
  if (text === null) return Response.json({ error: "The recording is too large" }, { status: 413 })
  const { input, threadId, runId } = generationParamsFromBody("transcription", JSON.parse(text))
  const prompt = await dictationPrompt()
  // The body was read and the prompt asked for meanwhile: another draft may have come first.
  if (draft && drafting) return Response.json({ error: "Another draft is being written" }, { status: 429 })
  const release = draft ? hold() : () => undefined
  try {
    const stream = generateTranscription({
      adapter,
      threadId,
      runId,
      audio: input.audio,
      language: input.language,
      ...(prompt !== undefined && { prompt }),
      // A draft that the field no longer needs is called off at the gateway too: the whole recording then
      // has the gateway to itself.
      abortSignal: request.signal,
      stream: true,
    })
    request.signal.addEventListener("abort", release, { once: true })
    return toServerSentEventsResponse(releasing(stream, release))
  } catch (problem) {
    release()
    throw problem
  }
}

/** Takes the one place for a draft, and gives the way to free it again, once. */
function hold(): () => void {
  drafting = true
  let held = true
  const release = () => {
    if (!held) return
    held = false
    clearTimeout(late)
    drafting = false
  }
  const late = setTimeout(release, DRAFT_HELD_MS)
  return release
}

/** The stream as it is, and the place of the draft freed when it ends, fails or is cancelled. */
async function* releasing<T>(stream: AsyncIterable<T>, release: () => void): AsyncIterable<T> {
  try {
    yield* stream
  } finally {
    release()
  }
}

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: { POST: transcribe },
  },
})
