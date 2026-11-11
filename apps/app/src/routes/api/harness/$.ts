import { createFileRoute } from "@tanstack/react-router"

import { harnessHandler } from "@/chat/assistant.server.ts"

// Every path below /api/harness belongs to the agent harness (run, sessions, events, ...).
function serve({ request }: { request: Request }) {
  const handle = harnessHandler()
  if (!handle) return Response.json({ error: "No language model configured" }, { status: 503 })
  return handle(request)
}

export const Route = createFileRoute("/api/harness/$")({
  server: {
    handlers: { GET: serve, POST: serve },
  },
})
