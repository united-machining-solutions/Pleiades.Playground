import { createFileRoute } from "@tanstack/react-router"

import { furtherServerList } from "@/showcases/titan/further-tools.server.ts"
import { TITAN_TOOLS } from "@/showcases/titan/turn.ts"

// What Titan can read with: its own tools of the generative UI backend, always there, and the further
// MCP servers of the app (APP_MCP_SERVERS) with the tools Titan takes of each, for the menu on Titan's
// page that switches a server on (showcases/titan/tools-menu.tsx). Names only: no address leaves the server.

export const Route = createFileRoute("/(showcases)/titan/api/tools")({
  server: {
    handlers: {
      GET: async () => Response.json({ own: TITAN_TOOLS.map((tool) => tool.function.name), servers: await furtherServerList() }),
    },
  },
})
