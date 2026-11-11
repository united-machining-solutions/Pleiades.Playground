import { createFileRoute } from "@tanstack/react-router"

// Liveness endpoint for the container health check, answering like the other services.
export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: () => new Response("Healthy"),
    },
  },
})
