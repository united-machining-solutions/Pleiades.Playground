import { machineList, machineShow } from "@pleiades/cards/machine/contract.ts"
import { toolDefinition } from "@tanstack/ai"
import { createMCPServer, resourceDefinition } from "@tanstack/ai-mcp/server"
import type { MCPToolContext } from "@tanstack/ai-mcp/server"
import { z } from "zod"

import type { Apis } from "./apis.ts"
import { CARD_MIME_TYPE, readCardFile } from "./card-file.ts"
import { description, skillGuide } from "./guide.ts"
import { HISTORY_HOURS, listMachines, showMachine } from "./machines.ts"
import { inTimeZoneOf, isTimeZone } from "./time.ts"

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

/** The machine card as a file for other hosts. The example application draws the card itself. */
export const MACHINE_CARD_URI = "ui://genui/machine"

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

/** A caller that shows the result to a person names that person's time zone. */
const timeZone = z
  .string()
  .refine(isTimeZone, "This is not a time zone the server knows.")
  .optional()
  .describe(
    "The IANA time zone to write every instant of the result in, for example Europe/Zurich. The instants are then local times with their offset to UTC. UTC if omitted.",
  )

const machineListTool = toolDefinition({
  name: "genui_machine_list",
  description:
    "List every machine with what it does now: connection, state and operation mode with the time since when, the active program, and the warnings and errors of the last 24 hours that have not gone. Every value names the topic it comes from.",
  inputSchema: z.object({ timeZone }),
  outputSchema: machineList,
  metadata: { title: "List machines", annotations: readOnly },
}).server<Context>(async (input, ctx) => inTimeZoneOf(await listMachines(ctx.context.apis), input.timeZone))

const machineShowTool = toolDefinition({
  name: "genui_machine_show",
  description:
    "Show one machine: what it does now, as in genui_machine_list, and which states it went through over the last hours, as spans without a gap. Use it for a question about a single machine. The result is the contract of the machine card.",
  inputSchema: z.object({
    machine: z
      .string()
      .regex(/^[\w.-]+$/)
      .describe("The serial number of the machine, for example P-04."),
    hours: z
      .number()
      .int()
      .min(1)
      .max(24)
      .optional()
      .describe(`How many hours back the history goes. ${HISTORY_HOURS} if omitted.`),
    timeZone,
  }),
  outputSchema: machineShow,
  // The link to the card: a host that shows MCP Apps loads that resource and draws the result with it.
  metadata: { title: "Show machine", annotations: readOnly, _meta: { ui: { resourceUri: MACHINE_CARD_URI } } },
}).server<Context>(async (input, ctx) =>
  inTimeZoneOf(await showMachine(ctx.context.apis, input.machine, input.hours), input.timeZone),
)

export const server = createMCPServer({
  name: "genui",
  version: "0.1.0",
  tools: [describeServer, getSkillGuide, machineListTool, machineShowTool],
  resources: [
    resourceDefinition({ uri: "genui://skill", name: "skill", mimeType: "text/markdown" }).read(() => ({
      text: skillGuide,
    })),
    resourceDefinition({ uri: MACHINE_CARD_URI, name: "machine-card", mimeType: CARD_MIME_TYPE }).read(async () => ({
      text: await readCardFile("machine"),
    })),
  ],
})
