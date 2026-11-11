import { machineList, machineShow } from "@pleiades/cards/machine/contract.ts"
import { machineListInWords, machineShowInWords } from "@pleiades/cards/machine/in-words.ts"
import { toolDefinition } from "@tanstack/ai"
import { createMCPServer, resourceDefinition } from "@tanstack/ai-mcp/server"
import type { MCPToolContext } from "@tanstack/ai-mcp/server"
import { z } from "zod"

import type { Apis } from "./apis.ts"
import { CARD_META, CARD_MIME_TYPE, readCardFile } from "./card-file.ts"
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

/**
 * A result that says in words what its values are. A language model reads the words and a display
 * reads the values, so nobody has to read the values as text: a result is an answer, not raw
 * data. The library sends a result of this shape as it is. Its types know only the values, hence
 * the cast.
 */
function inWords<TValues>(values: TValues, words: string): TValues {
  return { content: [{ type: "text", text: words }], structuredContent: values } as unknown as TValues
}

/** The machine card as a file for other hosts. The example application draws the card itself. */
export const MACHINE_CARD_URI = "ui://genui/machine"

/** What a language model is told with the words of a card: who sees what, and what is left to say. */
const shownAsCard =
  "Where the host shows MCP Apps, the person already sees this result as the machine card: these values, and the states of the last hours as a band. Then a sentence or two is the whole answer. Do not list the values again, and do not draw them again."

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
    "List every machine with what it does now: connection, state and operation mode with the time since when, the active program, and the warnings and errors of the last 24 hours that have not gone. The result says it in a line for each machine and carries the values for a display. Every value names the topic it comes from.",
  inputSchema: z.object({ timeZone }),
  outputSchema: machineList,
  metadata: { title: "List machines", annotations: readOnly },
}).server<Context>(async (input, ctx) => {
  const list = inTimeZoneOf(await listMachines(ctx.context.apis), input.timeZone)
  return inWords(list, machineListInWords(list))
})

const machineShowTool = toolDefinition({
  name: "genui_machine_show",
  description:
    "Show one machine: what it does now, as in genui_machine_list, and what it did over the last hours: how long each state lasted in total, and the states as spans without a gap. Use it for a question about a single machine. The result says it in words and carries the values of the machine card, which a host that shows MCP Apps draws for the person.",
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
}).server<Context>(async (input, ctx) => {
  const shown = inTimeZoneOf(await showMachine(ctx.context.apis, input.machine, input.hours), input.timeZone)
  return inWords(shown, `${machineShowInWords(shown)}\n\n${shownAsCard}`)
})

export const server = createMCPServer({
  name: "genui",
  version: "0.1.0",
  tools: [describeServer, getSkillGuide, machineListTool, machineShowTool],
  resources: [
    resourceDefinition({ uri: "genui://skill", name: "skill", mimeType: "text/markdown" }).read(() => ({
      text: skillGuide,
    })),
  ],
  // The card files are registered here and not under `resources`: a card tells the host how to
  // show it, and `resourceDefinition` has no place for that (`_meta`).
  setup(mcp) {
    mcp.registerResource(
      "machine-card",
      MACHINE_CARD_URI,
      { mimeType: CARD_MIME_TYPE, _meta: CARD_META },
      async (uri) => ({
        contents: [
          { uri: uri.href, mimeType: CARD_MIME_TYPE, text: await readCardFile("machine"), _meta: CARD_META },
        ],
      }),
    )
  },
})
