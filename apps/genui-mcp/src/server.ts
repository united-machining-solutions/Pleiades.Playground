import { toolDefinition } from "@tanstack/ai"
import { createMCPServer, resourceDefinition } from "@tanstack/ai-mcp/server"
import { z } from "zod"

import { CARD_META, CARD_MIME_TYPE, readCardFile } from "./card-file.ts"
import { cards } from "./cards/index.ts"
import { description, skillGuide } from "./guide.ts"
import { readOnly, text } from "./tool.ts"

// The MCP server. It names no card: its tools and its card files are those of the cards that
// cards/index.ts lists, next to the two tools of its own, with which a caller finds its way. The
// one setting read on the way is the one of the card files (card-file.ts).

const describeServer = toolDefinition({
  name: "genui_describe_server",
  description:
    "Describe this MCP server, the recommended discovery flow and the available tools. Use this first if you are connected but do not yet know which tools are available.",
  inputSchema: z.object({}),
  metadata: { title: "Describe server", annotations: readOnly },
}).server(() => text(description))

const getSkillGuide = toolDefinition({
  name: "genui_get_skill_guide",
  description:
    "Return the skill guide of this server as markdown: what the values of a result mean and how to read them. The text of a result answers a question about a machine by itself. Read the guide before you work with the values.",
  inputSchema: z.object({}),
  metadata: { title: "Get skill guide", annotations: readOnly },
}).server(() => text(skillGuide))

export const server = createMCPServer({
  name: "genui",
  version: "0.1.0",
  tools: [describeServer, getSkillGuide, ...cards.flatMap((card) => card.tools)],
  resources: [
    resourceDefinition({ uri: "genui://skill", name: "skill", mimeType: "text/markdown" }).read(() => ({
      text: skillGuide,
    })),
  ],
  // The card files are registered here and not under `resources`: a card tells the host how to
  // show it, and `resourceDefinition` has no place for that (`_meta`).
  setup(mcp) {
    for (const { file } of cards) {
      if (!file) continue
      mcp.registerResource(
        `${file.name}-card`,
        file.uri,
        { mimeType: CARD_MIME_TYPE, _meta: CARD_META },
        async (uri) => ({
          contents: [
            { uri: uri.href, mimeType: CARD_MIME_TYPE, text: await readCardFile(file.name), _meta: CARD_META },
          ],
        }),
      )
    }
  },
})
