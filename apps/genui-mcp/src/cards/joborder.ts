import { JOB_ORDER_HOURS, MOST_JOB_ORDER_HOURS, jobOrderShow, jobOrderTimeline } from "@pleiades/cards/joborder/contract.ts"
import { jobOrderShowInWords } from "@pleiades/cards/joborder/in-words.ts"
import { MACHINE_NAMING, instant, machineId } from "@pleiades/cards/machine/contract.ts"
import { toolDefinition } from "@tanstack/ai"
import { z } from "zod"

import { card } from "../card.ts"
import { listJobOrderTimeline, showJobOrder } from "../job-order-history.ts"
import { inTimeZoneOf, knownTimeZone } from "../time.ts"
import { inWords, readOnly, timeZone } from "../tool.ts"
import type { Context } from "../tool.ts"

import { JOB_ORDER_CARD_URI, JOB_ORDER_TIMELINE_TOOL } from "./joborder.names.ts"

// The job order card: the job order of one machine and the program execution in it, by the names of the
// umati data model, and both over the last hours as a timeline, which the card asks for itself. What
// computes it is in job-order-history.ts.

export { JOB_ORDER_CARD_URI, JOB_ORDER_TIMELINE_TOOL }

const shownAsCard =
  "Where the host shows MCP Apps, the person already sees this result as the job order card: the job order, its program execution, and both over these hours as a timeline. Then a sentence or two is the whole answer. Do not list the values again."

const jobOrderShowTool = toolDefinition({
  name: "genui_job_order_show",
  description:
    "Show the job order of one machine (JobMonitoring.JobOrders with its result) and its program execution (WorkMasterMonitoring.ProgramExecution), with how many job orders and program executions there were over the last hours. The result says it in a few lines and carries the values of the job order card, which also draws both over those hours. Name the machine by its id or as people call it. Call it whenever a person asks about the job order, the order or the program of a machine; after genui_job_order_list, call it for each machine its result names. Every job order on the list of every machine is in genui_job_order_list, which draws no card.",
  inputSchema: z.object({
    machine: machineId.describe(MACHINE_NAMING),
    hours: z
      .number()
      .int()
      .min(1)
      .max(MOST_JOB_ORDER_HOURS)
      .optional()
      .describe(`How many hours back, up to now. ${JOB_ORDER_HOURS} if omitted.`),
    timeZone,
  }),
  outputSchema: jobOrderShow,
  metadata: { title: "Show job order", annotations: readOnly, _meta: { ui: { resourceUri: JOB_ORDER_CARD_URI } } },
}).server<Context>(async (input, ctx) => {
  const zone = knownTimeZone(input.timeZone)
  const shown = inTimeZoneOf(await showJobOrder(ctx.context.apis, input.machine, input.hours), zone)
  return inWords(shown, `${jobOrderShowInWords(shown)}\n\n${shownAsCard}`)
})

const jobOrderTimelineTool = toolDefinition({
  name: JOB_ORDER_TIMELINE_TOOL,
  description:
    "List the job orders and program executions of one machine between two instants as spans: what the timeline of the job order card draws. The card calls it after genui_job_order_show, with `machine`, `from` and `asOf` of that result. A language model does not need it: the job order, the program execution and the counts are in the result of genui_job_order_show.",
  inputSchema: z.object({
    machine: machineId.describe("The machine id: `machine` of genui_job_order_show."),
    from: instant.describe("Where the timeline begins: `from` of genui_job_order_show."),
    to: instant.describe(`Where it ends: \`asOf\` of genui_job_order_show. At most ${MOST_JOB_ORDER_HOURS} hours after \`from\`.`),
  }),
  outputSchema: jobOrderTimeline,
  // Only a card calls this tool: a host that shows MCP Apps does not offer it to its language model.
  metadata: { title: "List job order timeline", annotations: readOnly, _meta: { ui: { visibility: ["app"] } } },
}).server<Context>(async (input, ctx) => {
  const timeline = await listJobOrderTimeline(ctx.context.apis, input.machine, input.from, input.to)
  return inWords(
    timeline,
    `${timeline.jobOrders.length} job orders and ${timeline.programExecutions.length} program executions of ${timeline.machine} from ${timeline.from} to ${timeline.to}, for the timeline of the job order card.`,
  )
})

const jobOrderGuide = `## Job order

\`genui_job_order_show\` shows the job order of one machine and the program execution in it, by the names of
the umati data model, over the last \`hours\` (${JOB_ORDER_HOURS} if omitted, at most ${MOST_JOB_ORDER_HOURS}).
Name the machine (\`machine\`) by its id or as people call it, and pass the \`timeZone\` of the person you
answer, if you know it. Everything comes from the events of the machine, as the Events API puts them together.

- \`jobOrder\` is the entry of \`JobMonitoring.JobOrders\` that runs or is interrupted, else the one whose last
  event is the newest; one left open by an earlier run of the adapter only where there is no other. With what
  came of it (\`JobMonitoring.JobOrderResults\`): \`produced\`, \`good\`, \`result\`. Null if the machine has none.
- \`programExecution\` is the \`WorkMasterMonitoring.ProgramExecution\` that runs or is interrupted, else the
  newest that ended: its \`ActiveWorkMaster\` (the program), \`State\`, \`StartTime\`, \`EndTime\`, \`Duration\` in
  seconds and the \`JobOrderID\` it belongs to.
- A job order or a program execution that never ended counts as running only until the adapter of the
  machine started again (\`umati/Connection/State\` became \`Initializing\`): a new start begins with empty lists.
- \`jobOrders\` counts the job orders on the list at some time in the hours, waiting ones too;
  \`programExecutions\` the program executions that ran in them, \`aborted\` those of them that were aborted.
  Where \`hasMore\` is true they are lower bounds: say "at least".

The spans of both over these hours are what the timeline of the card draws. They grow with time, so they are
not in that result: the card asks \`${JOB_ORDER_TIMELINE_TOOL}\` for them itself. You do not need it.
`

export const jobOrderCard = card({
  tools: [jobOrderShowTool, jobOrderTimelineTool],
  describes: [
    "- genui_job_order_show: the job order of one machine and its program execution, and both over the last hours.",
    `- ${JOB_ORDER_TIMELINE_TOOL}: the job orders and program executions of one machine as spans, for the timeline of the card. A card calls it.`,
  ],
  guide: jobOrderGuide,
  file: { name: "joborder", uri: JOB_ORDER_CARD_URI },
})
