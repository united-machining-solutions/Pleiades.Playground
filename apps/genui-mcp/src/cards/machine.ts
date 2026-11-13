import { BAND_SLOTS, instant, machineList, machineShow, serialNumber, spanList } from "@pleiades/cards/machine/contract.ts"
import { machineListInWords, machineShowInWords, spanListInWords } from "@pleiades/cards/machine/in-words.ts"
import { toolDefinition } from "@tanstack/ai"
import { z } from "zod"

import { card } from "../card.ts"
import { HISTORY_HOURS, MOST_HOURS, listMachines, listSpans, showMachine } from "../machines.ts"
import { inTimeZoneOf, knownTimeZone } from "../time.ts"
import { inWords, readOnly, timeZone } from "../tool.ts"
import type { Context } from "../tool.ts"
import { machineGuide } from "./machine.guide.ts"
import { MACHINE_CARD_URI, SPAN_LIST_TOOL } from "./machine.names.ts"

// The machine card: what every machine does now, one machine with its history, and the spans of
// its band. What computes them is in machines.ts, history.ts and liveness.ts.

/** What a language model is told with the words of a card: who sees what, and what is left to say. */
const shownAsCard =
  "Where the host shows MCP Apps, the person already sees this result as the machine card: these values, and the states of the last hours as a band. Then a sentence or two is the whole answer. Do not list the values again, and do not draw them again."

const machine = serialNumber.describe("The serial number of the machine, for example P-04.")

const machineListTool = toolDefinition({
  name: "genui_machine_list",
  description:
    "List every machine with what it does now: connection, state and operation mode with the time since when, the active program, and the warnings and errors of the last 24 hours that have not gone. The result says it in a line for each machine and carries the values for a display. Every value names the topic it comes from.",
  inputSchema: z.object({ timeZone }),
  outputSchema: machineList,
  metadata: { title: "List machines", annotations: readOnly },
}).server<Context>(async (input, ctx) => {
  const zone = knownTimeZone(input.timeZone)
  const list = inTimeZoneOf(await listMachines(ctx.context.apis), zone)
  return inWords(list, machineListInWords(list))
})

const machineShowTool = toolDefinition({
  name: "genui_machine_show",
  description:
    "Show one machine: what it does now, as in genui_machine_list, and how long each state lasted in total over the last hours. Use it for a question about a single machine. The result says it in words and carries the values of the machine card, which a host that shows MCP Apps draws for the person.",
  inputSchema: z.object({
    machine,
    hours: z
      .number()
      .int()
      .min(1)
      .max(MOST_HOURS)
      .optional()
      .describe(`How many hours back the history goes. ${HISTORY_HOURS} if omitted.`),
    timeZone,
  }),
  outputSchema: machineShow,
  // The link to the card: a host that shows MCP Apps loads that resource and draws the result with it.
  metadata: { title: "Show machine", annotations: readOnly, _meta: { ui: { resourceUri: MACHINE_CARD_URI } } },
}).server<Context>(async (input, ctx) => {
  const zone = knownTimeZone(input.timeZone)
  const shown = inTimeZoneOf(await showMachine(ctx.context.apis, input.machine, input.hours), zone)
  return inWords(shown, `${machineShowInWords(shown)}\n\n${shownAsCard}`)
})

const spanListTool = toolDefinition({
  name: SPAN_LIST_TOOL,
  description:
    "List the states of one machine between two instants as spans without a gap: what the band of the machine card draws. A card calls it after genui_machine_show, with `history.from` and `history.to` of that result. A language model does not need it to say how long or how often: the sums are in the result of genui_machine_show.",
  inputSchema: z.object({
    machine,
    from: instant.describe("Where the spans begin: `history.from` of genui_machine_show."),
    to: instant.describe(`Where they end: \`history.to\` of genui_machine_show. At most ${MOST_HOURS} hours after \`from\`.`),
    slots: z
      .number()
      .int()
      .min(1)
      .max(2000)
      .optional()
      .describe(
        `How many spans the band has room for, ${BAND_SLOTS} if omitted. A longer history is thinned to that many: each slot then shows the state that lasted longest in it, and an alarm always keeps a slot.`,
      ),
  }),
  outputSchema: spanList,
  // Only a card calls this tool: a host that shows MCP Apps does not offer it to its language model.
  metadata: { title: "List spans", annotations: readOnly, _meta: { ui: { visibility: ["app"] } } },
}).server<Context>(async (input, ctx) => {
  const list = await listSpans(ctx.context.apis, input.machine, input.from, input.to, input.slots)
  return inWords(list, spanListInWords(list))
})

export const machineCard = card({
  tools: [machineListTool, machineShowTool, spanListTool],
  describes: [
    "- genui_machine_list: every machine with what it does now.",
    "- genui_machine_show: one machine with what it does now and how long each state lasted over the last hours.",
    "- genui_span_list: the states of one machine as spans, for the band of a card. A card calls it.",
  ],
  guide: machineGuide,
  file: { name: "machine", uri: MACHINE_CARD_URI },
})
