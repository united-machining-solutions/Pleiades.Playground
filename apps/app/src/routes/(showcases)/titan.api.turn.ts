import { createFileRoute } from "@tanstack/react-router"

import { readBodyText } from "@/chat/body.ts"
import { titanModels } from "@/showcases/titan/gateway.server.ts"
import { answer } from "@/showcases/titan/turn.server.ts"
import { MOST_BODY_BYTES, conversationOf } from "@/showcases/titan/turn.ts"
import type { TurnEvent } from "@/showcases/titan/turn.ts"

// A turn of the conversation with Titan (showcases/titan/turn.server.ts): the browser sends the
// conversation so far, { messages, timeZone }, the last message being the question, and gets the answer
// as it arrives, a line of JSON for each event. Nothing is kept on the server: the conversation lives
// in the page, and is gone when the page is left.
//
// GET says whether Titan has a model to talk with.

async function turn({ request }: { request: Request }) {
  const models = await titanModels()
  const chat = models?.chat
  if (!models || !chat) return Response.json({ error: "No language model at the gateway" }, { status: 503 })
  const sent = await readBodyText(request, MOST_BODY_BYTES)
  if (sent === null) return Response.json({ error: "The conversation is too large" }, { status: 413 })
  let body: { timeZone?: unknown } | undefined
  try {
    body = JSON.parse(sent) as { timeZone?: unknown }
  } catch {
    body = undefined
  }
  const conversation = conversationOf(body)
  if (!conversation) return Response.json({ error: "Send { messages }, the last one a question" }, { status: 400 })
  const timeZone = typeof body?.timeZone === "string" ? body.timeZone : undefined
  const encoder = new TextEncoder()
  // The browser hangs up when a new question interrupts the answer: then the model is hung up on too.
  const stop = new AbortController()
  request.signal.addEventListener("abort", () => stop.abort())
  const events = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: TurnEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          // The browser is gone.
        }
      }
      await answer({ ...models, chat }, conversation, timeZone, emit, stop.signal)
      try {
        controller.close()
      } catch {
        // Closed already.
      }
    },
    cancel: () => stop.abort(),
  })
  return new Response(events, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } })
}

export const Route = createFileRoute("/(showcases)/titan/api/turn")({
  server: {
    handlers: {
      GET: async () => Response.json({ available: (await titanModels())?.chat !== undefined }),
      POST: turn,
    },
  },
})
