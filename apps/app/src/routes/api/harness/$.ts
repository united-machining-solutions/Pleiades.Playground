import { createFileRoute } from "@tanstack/react-router"

import { harnessHandler } from "@/chat/assistant.server.ts"
import { chatSettings } from "@/chat/gateway.ts"

// Every path below /api/harness belongs to the agent harness (run, sessions, events, ...).
async function serve({ request }: { request: Request }) {
  const handle = await harnessHandler()
  if (!handle) {
    // Why there is none, by the names of the settings: the same words as in the chat panel.
    const { gaps } = await chatSettings()
    return Response.json({ error: "No language model configured", gaps }, { status: 503 })
  }
  return handle(request)
}

export const Route = createFileRoute("/api/harness/$")({
  server: {
    handlers: { GET: serve, POST: serve },
  },
})
