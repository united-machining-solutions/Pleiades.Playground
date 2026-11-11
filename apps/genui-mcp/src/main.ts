import { serve } from "srvx"

import { server } from "./server.ts"

const apis = {
  timeseriesUrl: process.env.TIMESERIES_API_URL ?? "http://localhost:5500",
  eventsUrl: process.env.EVENTS_API_URL ?? "http://localhost:5510",
}

serve({
  port: Number(process.env.PORT ?? 5520),
  hostname: process.env.HOST,
  fetch(request) {
    const { pathname } = new URL(request.url)
    if (pathname === "/mcp") return server.handle(request, { context: { apis } })
    // Liveness, answering like the other services.
    if (pathname === "/health") return new Response("Healthy")
    return new Response("Not found", { status: 404 })
  },
})
