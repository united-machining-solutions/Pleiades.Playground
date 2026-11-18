import { machineId } from "@pleiades/cards/machine/contract.ts"
import { LANE_SLOTS, conditionKey, trulaserSeries, trulaserShow, trulaserTimeline } from "@pleiades/cards/trulaser/contract.ts"
import { trulaserShowInWords } from "@pleiades/cards/trulaser/words.ts"
import { toolDefinition } from "@tanstack/ai"
import { z } from "zod"

import { card } from "../card.ts"
import { inTimeZoneOf, knownTimeZone } from "../time.ts"
import { inWords, readOnly, timeZone } from "../tool.ts"
import type { Context } from "../tool.ts"
import { MOST_TIMELINE_HOURS, TIMELINE_DEFAULT_HOURS, listSeries, listTimeline, showTrulaser } from "../trulaser.ts"

import { TRULASER_CARD_URI, TRULASER_SERIES_TOOL, TRULASER_TIMELINE_TOOL } from "./trulaser.names.ts"

// The TruLaser card: what a TRUMPF laser cutting machine reports through its edge component, its
// timelines and the charts of its condition guide, which the card asks for itself. What reads them
// is in trulaser.ts.

export { TRULASER_CARD_URI, TRULASER_SERIES_TOOL, TRULASER_TIMELINE_TOOL }

const shownAsCard =
  "Where the host shows MCP Apps, the person already sees this result as the TruLaser card: these values, the timelines of the states, runs and automation devices, and the tiles of the condition guide. Then a sentence or two is the whole answer. Do not list the values again."

const hours = z
  .number()
  .int()
  .min(1)
  .max(MOST_TIMELINE_HOURS)
  .optional()
  .describe(`How many hours back the values go. ${TIMELINE_DEFAULT_HOURS} if omitted.`)

const trulaserShowTool = toolDefinition({
  name: "genui_trulaser_show",
  description:
    "Show a TRUMPF laser cutting machine (TruLaser) as its edge component reports it: item state and operation mode, the change cause that put it there and what blocks its sequence, the units in malfunction, the requests of its automation devices (load, unload, sorting, separating, palletizing), the program run and the production plan, the collision detection, the laser technology, and the condition guide: levels and pressures of its media with their thresholds. Without `machine` it shows the first machine that has an edge component.",
  inputSchema: z.object({
    machine: machineId
      .optional()
      .describe("The machine id, for example trumpf_PLL01_L1649A-STARLINER. The first TruLaser if omitted."),
    timeZone,
  }),
  outputSchema: trulaserShow,
  metadata: { title: "Show TruLaser", annotations: readOnly, _meta: { ui: { resourceUri: TRULASER_CARD_URI } } },
}).server<Context>(async (input, ctx) => {
  const zone = knownTimeZone(input.timeZone)
  const shown = inTimeZoneOf(await showTrulaser(ctx.context.apis, input.machine), zone)
  return inWords(shown, `${trulaserShowInWords(shown)}\n\n${shownAsCard}`)
})

const trulaserTimelineTool = toolDefinition({
  name: TRULASER_TIMELINE_TOOL,
  description:
    "List what a TruLaser did over the last hours, one lane each on the same time axis: item state, operation mode, change cause, sequence, program run, production plan, the request state of every automation device, and the units in malfunction. The TruLaser card calls it after genui_trulaser_show. A language model does not need it.",
  inputSchema: z.object({
    machine: machineId.describe("The machine id: `machine` of genui_trulaser_show."),
    hours,
    slots: z
      .number()
      .int()
      .min(1)
      .max(2000)
      .optional()
      .describe(`How many spans a lane has room for, ${LANE_SLOTS} if omitted. Each slot shows the value that lasted longest in it.`),
  }),
  outputSchema: trulaserTimeline,
  // Only a card calls this tool: a host that shows MCP Apps does not offer it to its language model.
  metadata: { title: "List TruLaser timeline", annotations: readOnly, _meta: { ui: { visibility: ["app"] } } },
}).server<Context>(async (input, ctx) => {
  const timeline = await listTimeline(ctx.context.apis, input.machine, input.hours, input.slots)
  return inWords(
    timeline,
    `${timeline.lanes.length} lanes of ${timeline.machine} from ${timeline.from} to ${timeline.to}, ${timeline.malfunctions.length} stretches with a unit in malfunction, for the timelines of the TruLaser card.`,
  )
})

const trulaserSeriesTool = toolDefinition({
  name: TRULASER_SERIES_TOOL,
  description:
    "List the values of one tile of the condition guide of a TruLaser over the last hours: what the chart of the tile draws. The TruLaser card calls it when a person opens a tile. A language model does not need it.",
  inputSchema: z.object({
    machine: machineId.describe("The machine id: `machine` of genui_trulaser_show."),
    key: conditionKey.describe("The tile: `key` of a tile of `conditionGuide` of genui_trulaser_show."),
    hours,
  }),
  outputSchema: trulaserSeries,
  // Only a card calls this tool: a host that shows MCP Apps does not offer it to its language model.
  metadata: { title: "List TruLaser series", annotations: readOnly, _meta: { ui: { visibility: ["app"] } } },
}).server<Context>(async (input, ctx) => {
  const series = await listSeries(ctx.context.apis, input.machine, input.key, input.hours)
  return inWords(series, `${series.points.length} values of ${series.label} from ${series.from} to ${series.to}, for the chart of the tile.`)
})

const trulaserGuide = `## TruLaser

\`genui_trulaser_show\` shows a TRUMPF laser cutting machine as its edge component reports it, below
\`machines/{machineId}/oem/Dalle/\`. Pass the \`timeZone\` of the person you answer, if you know it.

- \`signals.itemState\`, \`signals.operationMode\`: the state of the machine.
- \`signals.changeCauseSignal\` and \`sequence\`: the signal that caused the last change of state, the state
  of its sequence and, in \`blockingCause\`, what blocks it (Operator, InternalMalfunction, Other).
- \`unitsInMalfunction\`: the units that are in malfunction now. An empty list: none is.
- \`devices\`: the automation devices and the state of their requests (Active, Idle, Invalid).
- \`signals.programRunState\`, \`signals.productionPlanRunState\`: the program run and the production plan.
  Their ids link them: \`programRunId\`, \`productionPlanRunId\`.
- \`signals.collisionState\`: the collision detection, with the NC blocks before, at and after it.
- \`conditionGuide\`: the levels and pressures of the media. A value is stored in SI units: a level as a
  fraction in \`one\` (0.85 is 85 percent), a pressure in \`pascal\` (100 pascal is 1 millibar).
  \`status\` says whether the machine raised a threshold: \`error\`, \`warning\`, \`ok\`, or null where it
  publishes no threshold for the value.

The timelines and the charts of the tiles grow with time, so they are not in that result: the card asks
\`genui_trulaser_timeline\` and \`genui_trulaser_series\` for them itself. You do not need them.
`

export const trulaserCard = card({
  tools: [trulaserShowTool, trulaserTimelineTool, trulaserSeriesTool],
  describes: [
    "- genui_trulaser_show: a TRUMPF laser cutting machine as its edge component reports it.",
    "- genui_trulaser_timeline: the lanes of its states, runs and automation devices over time, for the card. A card calls it.",
    "- genui_trulaser_series: the values of one tile of its condition guide over time, for the card. A card calls it.",
  ],
  guide: trulaserGuide,
  file: { name: "trulaser", uri: TRULASER_CARD_URI },
})
