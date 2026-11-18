import { machineId } from "@pleiades/cards/machine/contract.ts"
import {
  LANE_SLOTS,
  conditionKey,
  timelineView,
  trulaserCollision,
  trulaserConditions,
  trulaserDevices,
  trulaserJobOrder,
  trulaserSeries,
  trulaserStatus,
  trulaserTechnology,
  trulaserTimeline,
} from "@pleiades/cards/trulaser/contract.ts"
import {
  trulaserCollisionInWords,
  trulaserConditionsInWords,
  trulaserDevicesInWords,
  trulaserJobOrderInWords,
  trulaserStatusInWords,
  trulaserTechnologyInWords,
} from "@pleiades/cards/trulaser/words.ts"
import { toolDefinition } from "@tanstack/ai"
import { z } from "zod"

import { card } from "../card.ts"
import { inTimeZoneOf, knownTimeZone } from "../time.ts"
import { inWords, readOnly, timeZone } from "../tool.ts"
import type { Context } from "../tool.ts"
import {
  MOST_TIMELINE_HOURS,
  TIMELINE_DEFAULT_HOURS,
  listSeries,
  listTimeline,
  showCollision,
  showConditions,
  showDevices,
  showJobOrder,
  showStatus,
  showTechnology,
} from "../trulaser.ts"

import { TRULASER_CARD_URI, TRULASER_SERIES_TOOL, TRULASER_TIMELINE_TOOL } from "./trulaser.names.ts"

// The TruLaser cards: what a TRUMPF laser cutting machine reports through its edge component, one tool
// for each card, so a language model can read and show each one alone. The timelines and the charts
// of the condition guide the cards ask for themselves. What reads them is in trulaser.ts.

export { TRULASER_CARD_URI, TRULASER_SERIES_TOOL, TRULASER_TIMELINE_TOOL }

const shownAsCard = (what: string) =>
  `Where the host shows MCP Apps, the person already sees this result as the ${what} card of the TruLaser. Then a sentence or two is the whole answer. Do not list the values again.`

const input = z.object({
  machine: machineId
    .optional()
    .describe("The machine id, for example trumpf_PLL01_L1649A-STARLINER. The first TruLaser if omitted."),
  timeZone,
})

const showsCard = { annotations: readOnly, _meta: { ui: { resourceUri: TRULASER_CARD_URI } } }

const statusTool = toolDefinition({
  name: "genui_trulaser_status",
  description:
    "Show the State.Status of a TRUMPF laser cutting machine (TruLaser) by the umati data model: MachineryItemState and MachineryOperationMode, the ChangeCause that put it there (an extension of TRUMPF: SignalName and SignalValue, with SequenceState and BlockingCause), and Notification.ActiveAlerts, the alerts that stand with their Severity after NAMUR NE 107, ErrorCode, Message and SourceName; a unit in malfunction is an alert of the category Failure with the unit as SourceName. The first card to read for what the machine does now and why.",
  inputSchema: input,
  outputSchema: trulaserStatus,
  metadata: { title: "Show TruLaser State.Status", ...showsCard },
}).server<Context>(async (asked, ctx) => {
  const shown = inTimeZoneOf(await showStatus(ctx.context.apis, asked.machine), knownTimeZone(asked.timeZone))
  return inWords(shown, `${trulaserStatusInWords(shown)}

${shownAsCard("State.Status")}`)
})

const jobOrderTool = toolDefinition({
  name: "genui_trulaser_joborder",
  description:
    "Show the JobOrder of a TruLaser by the umati data model: the entry of JobMonitoring.JobOrders that runs (JobOrderID, State, StateSince, JobName, WorkMasterID, RunsCompleted), and the WorkMasterMonitoring.ProgramExecution in it (ExecutionId, ActiveWorkMaster, State, StartTime, JobOrderID). The job order of a TruLaser is its production plan run: it holds the program executions that run one after the other.",
  inputSchema: input,
  outputSchema: trulaserJobOrder,
  metadata: { title: "Show TruLaser JobOrder", ...showsCard },
}).server<Context>(async (asked, ctx) => {
  const shown = inTimeZoneOf(await showJobOrder(ctx.context.apis, asked.machine), knownTimeZone(asked.timeZone))
  return inWords(shown, `${trulaserJobOrderInWords(shown)}

${shownAsCard("JobOrder")}`)
})

const devicesTool = toolDefinition({
  name: "genui_trulaser_devices",
  description:
    "Show the AutomationDeviceRequestStates of a TruLaser now: for HandlingLoad, HandlingUnload, Sorting, Separating and Palletizing the state of its request (Active, Scheduled, Idle, Error, Invalid) and its error code, and whether any request is active.",
  inputSchema: input,
  outputSchema: trulaserDevices,
  metadata: { title: "Show TruLaser automation requests", ...showsCard },
}).server<Context>(async (asked, ctx) => {
  const shown = inTimeZoneOf(await showDevices(ctx.context.apis, asked.machine), knownTimeZone(asked.timeZone))
  return inWords(shown, `${trulaserDevicesInWords(shown)}\n\n${shownAsCard("AutomationDeviceRequestStates")}`)
})

const technologyTool = toolDefinition({
  name: "genui_trulaser_technology",
  description:
    "Show the LaserTechnology of a TruLaser: the laser parameter set it cuts with (KeyName, Parent), the nozzle, the status of the set and of its data provider.",
  inputSchema: input,
  outputSchema: trulaserTechnology,
  metadata: { title: "Show TruLaser LaserTechnology", ...showsCard },
}).server<Context>(async (asked, ctx) => {
  const shown = inTimeZoneOf(await showTechnology(ctx.context.apis, asked.machine), knownTimeZone(asked.timeZone))
  return inWords(shown, `${trulaserTechnologyInWords(shown)}\n\n${shownAsCard("LaserTechnology")}`)
})

const collisionTool = toolDefinition({
  name: "genui_trulaser_collision",
  description:
    "Show the CollisionData of a TruLaser: the DetectionState of the collision detection, whether the nozzle collision stopped the machine, the program, and the NC blocks before, at and after the last detection.",
  inputSchema: input,
  outputSchema: trulaserCollision,
  metadata: { title: "Show TruLaser CollisionData", ...showsCard },
}).server<Context>(async (asked, ctx) => {
  const shown = inTimeZoneOf(await showCollision(ctx.context.apis, asked.machine), knownTimeZone(asked.timeZone))
  return inWords(shown, `${trulaserCollisionInWords(shown)}\n\n${shownAsCard("CollisionData")}`)
})

const conditionsTool = toolDefinition({
  name: "genui_trulaser_conditions",
  description:
    "Show the ConditionGuide of a TruLaser: the levels and pressures of its media (cut fluid, cool line, gas supply, cutting gases, lubricant), each with what its thresholds say.",
  inputSchema: input,
  outputSchema: trulaserConditions,
  metadata: { title: "Show TruLaser ConditionGuide", ...showsCard },
}).server<Context>(async (asked, ctx) => {
  const shown = inTimeZoneOf(await showConditions(ctx.context.apis, asked.machine), knownTimeZone(asked.timeZone))
  return inWords(shown, `${trulaserConditionsInWords(shown)}\n\n${shownAsCard("ConditionGuide")}`)
})

const hours = z
  .number()
  .int()
  .min(1)
  .max(MOST_TIMELINE_HOURS)
  .optional()
  .describe(`How many hours back the values go. ${TIMELINE_DEFAULT_HOURS} if omitted.`)

const timelineTool = toolDefinition({
  name: TRULASER_TIMELINE_TOOL,
  description:
    "List the timelines of a TruLaser over the last hours, one lane each on the same time axis: `status` the State.Status (MachineryItemState, MachineryOperationMode, with the ChangeCause on each span), the AutomationDeviceRequestStates and a lane of Notification alerts for each NE 107 category; `jobOrder` the JobMonitoring.JobOrders and the WorkMasterMonitoring.ProgramExecution in them; `devices` the AutomationDeviceRequestStates. The TruLaser cards call it. A language model does not need it.",
  inputSchema: z.object({
    machine: machineId.describe("The machine id: `machine` of a TruLaser card."),
    view: timelineView.optional().describe("Which timelines: status, jobOrder or devices. status if omitted."),
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
  metadata: { title: "List TruLaser timelines", annotations: readOnly, _meta: { ui: { visibility: ["app"] } } },
}).server<Context>(async (asked, ctx) => {
  const timeline = await listTimeline(ctx.context.apis, asked.machine, asked.view, asked.hours, asked.slots)
  return inWords(
    timeline,
    `${timeline.lanes.length} lanes (${timeline.view}) of ${timeline.machine} from ${timeline.from} to ${timeline.to}, ${timeline.failures.length} stretches with an alert of the category Failure, for the timelines of the TruLaser cards.`,
  )
})

const seriesTool = toolDefinition({
  name: TRULASER_SERIES_TOOL,
  description:
    "List the values of one tile of the ConditionGuide of a TruLaser over the last hours: what the chart of the tile draws. The ConditionGuide card calls it when a person opens a tile. A language model does not need it.",
  inputSchema: z.object({
    machine: machineId.describe("The machine id: `machine` of genui_trulaser_conditions."),
    key: conditionKey.describe("The tile: `key` of a tile of genui_trulaser_conditions."),
    hours,
  }),
  outputSchema: trulaserSeries,
  // Only a card calls this tool: a host that shows MCP Apps does not offer it to its language model.
  metadata: { title: "List TruLaser series", annotations: readOnly, _meta: { ui: { visibility: ["app"] } } },
}).server<Context>(async (asked, ctx) => {
  const series = await listSeries(ctx.context.apis, asked.machine, asked.key, asked.hours)
  return inWords(series, `${series.points.length} values of ${series.label} from ${series.from} to ${series.to}, for the chart of the tile.`)
})

const trulaserGuide = `## TruLaser

A TRUMPF laser cutting machine, read by the umati data model where the model has an element for it, and from
the extension of TRUMPF (\`x-trumpf-com.Dalle.*\`, below \`oem/Dalle/\`) where it has none. One tool for each card.
Pass the \`timeZone\` of the person you answer, if you know it. Without \`machine\` each shows the first TruLaser.

- \`genui_trulaser_status\`: \`State.Status\` (\`MachineryItemState\`, \`MachineryOperationMode\`), the \`ChangeCause\` of
  the extension (\`SignalName\`, \`SignalValue\` with \`SequenceState\` and \`BlockingCause\`), and
  \`Notification.ActiveAlerts\`: each alert with its \`Severity\` after NAMUR NE 107, \`ErrorCode\`, \`Message\` and
  \`SourceName\`. A unit in malfunction is an alert of the category Failure with the unit as \`SourceName\`. Read it
  first.
- \`genui_trulaser_joborder\`: the entry of \`JobMonitoring.JobOrders\` that runs, and the
  \`WorkMasterMonitoring.ProgramExecution\` in it. The job order is the production plan run of the machine; the
  program executions run in it one after the other, each with its \`ActiveWorkMaster\`.
- \`genui_trulaser_devices\`: the \`AutomationDeviceRequestStates\` of the extension. A request of HandlingLoad or
  HandlingUnload keeps the machine in Setup.
- \`genui_trulaser_technology\`: the \`LaserTechnology\` of the extension, the parameter set the machine cuts with.
- \`genui_trulaser_collision\`: the \`CollisionData\` of the extension, the collision detection and its NC blocks.
- \`genui_trulaser_conditions\`: the \`ConditionGuide\` of the extension. A value is stored in SI units: a level
  as a fraction in \`one\` (0.85 is 85 percent), a pressure in \`pascal\` (100 pascal is 1 millibar). \`status\` says
  whether the machine raised a threshold: \`error\`, \`warning\`, \`ok\`, or null where it has none.

The timelines and the charts of the tiles grow with time, so they are in no result: the cards ask
\`genui_trulaser_timeline\` and \`genui_trulaser_series\` for them themselves. You do not need them.
`

export const trulaserCard = card({
  tools: [statusTool, jobOrderTool, devicesTool, technologyTool, collisionTool, conditionsTool, timelineTool, seriesTool],
  describes: [
    "- genui_trulaser_status: the State.Status of a TRUMPF laser cutting machine, with its ChangeCause and Notification.ActiveAlerts.",
    "- genui_trulaser_joborder: its JobOrder and the ProgramExecution in it.",
    "- genui_trulaser_devices: its AutomationDeviceRequestStates.",
    "- genui_trulaser_technology: its LaserTechnology.",
    "- genui_trulaser_collision: its CollisionData.",
    "- genui_trulaser_conditions: its ConditionGuide.",
    "- genui_trulaser_timeline: its timelines of status, job orders and devices, for the cards. A card calls it.",
    "- genui_trulaser_series: the values of one tile of its ConditionGuide over time, for the card. A card calls it.",
  ],
  guide: trulaserGuide,
  file: { name: "trulaser", uri: TRULASER_CARD_URI },
})
