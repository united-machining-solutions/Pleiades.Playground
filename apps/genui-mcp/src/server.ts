import { toolDefinition } from "@tanstack/ai"
import { createMCPServer, resourceDefinition } from "@tanstack/ai-mcp/server"
import type { MCPToolContext } from "@tanstack/ai-mcp/server"
import { z } from "zod"

import type { Apis } from "./apis.ts"
import { description, skillGuide } from "./guide.ts"
import { listMachines, machineList } from "./machines.ts"

// The MCP server and its tools. Nothing here reads the environment: where the two APIs are comes
// with each request (see main.ts), so an application can import the type of this server.

type Context = MCPToolContext<{ apis: Apis }>

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] })

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
    "Return the skill guide of this server as markdown: what a result contains and how to read it. Have it in context before the first query.",
  inputSchema: z.object({}),
  metadata: { title: "Get skill guide", annotations: readOnly },
}).server(() => text(skillGuide))

const machineListTool = toolDefinition({
  name: "genui_machine_list",
  description:
    "List every machine with what it does now: connection, state and operation mode with the time since when, the active program, and the warnings and errors that have not gone. Every value names the topic it comes from.",
  inputSchema: z.object({}),
  outputSchema: machineList,
  metadata: { title: "List machines", annotations: readOnly },
}).server<Context>((_input, ctx) => listMachines(ctx.context.apis))

export const server = createMCPServer({
  name: "genui",
  version: "0.1.0",
  tools: [describeServer, getSkillGuide, machineListTool],
  resources: [
    resourceDefinition({ uri: "genui://skill", name: "skill", mimeType: "text/markdown" }).read(() => ({
      text: skillGuide,
    })),
  ],
})
