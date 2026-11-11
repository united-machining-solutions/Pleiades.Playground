import { serveMCPStdio } from "@tanstack/ai-mcp/server/stdio"
import { serve } from "srvx"

import { server } from "./server.ts"

const apis = {
  timeseriesUrl: process.env.TIMESERIES_API_URL ?? "http://localhost:5500",
  eventsUrl: process.env.EVENTS_API_URL ?? "http://localhost:5510",
}

if (process.argv.includes("--stdio")) {
  // A desktop host starts this process and talks to it on stdin and stdout. Nothing else may be
  // written to stdout: what the server logs goes to stderr.
  serveMCPStdio({ fetch: (request) => server.handle(request, { context: { apis } }) })
} else {
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
}
