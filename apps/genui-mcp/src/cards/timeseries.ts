import { instant } from "@pleiades/cards/machine/contract.ts"
import {
  MOST_LINES,
  MOST_UNITS,
  TIMESERIES_POINTS,
  TIMESERIES_RANGE,
  askedLine,
  timeseriesRange,
  timeseriesSeries,
  timeseriesShow,
  timeseriesSignals,
} from "@pleiades/cards/timeseries/contract.ts"
import { timeseriesShowInWords } from "@pleiades/cards/timeseries/in-words.ts"
import { toolDefinition } from "@tanstack/ai"
import { z } from "zod"

import { card } from "../card.ts"
import { inTimeZoneOf, knownTimeZone } from "../time.ts"
import { inWords, readOnly, timeZone } from "../tool.ts"
import type { Context } from "../tool.ts"
import { listTimeseriesSeries, listTimeseriesSignals, showTimeseries } from "../timeseries.ts"

import { TIMESERIES_CARD_URI, TIMESERIES_SERIES_TOOL, TIMESERIES_SIGNALS_TOOL } from "./timeseries.names.ts"

// The time series card: signals a person names, of any machine, over the last minutes or hours, and the
// graph of them, which the card asks for itself. What computes it is in timeseries.ts.

export { TIMESERIES_CARD_URI, TIMESERIES_SERIES_TOOL, TIMESERIES_SIGNALS_TOOL }

const shownAsCard =
  "Where the host shows MCP Apps, the person already sees this result as the time series card: a line for each signal over the range, which the person can change on the card. Then a sentence or two is the whole answer. Do not list the values again."

const lines = z.array(askedLine).min(1).max(MOST_LINES)

const range = timeseriesRange.describe(`How far back, up to now: 15m, 1h, 8h or 24h. ${TIMESERIES_RANGE} if omitted. The card offers the same four.`)

const timeseriesShowTool = toolDefinition({
  name: "genui_timeseries_show",
  description: `Show signals of machines over the last 15 minutes to 24 hours, a line for each pair of a machine and a signal, freely combined: the power of two machines and the bearing temperature of one, say. At most ${MOST_LINES} lines, and numbers of at most ${MOST_UNITS} units. For each line the newest value and the smallest and largest in the range, each in the unit it was published in. The result says it in a line for each, and the card draws the lines.`,
  inputSchema: z.object({
    lines: lines.describe("The pairs of a machine and a signal to draw, in the order of their colours."),
    range: range.optional(),
    timeZone,
  }),
  outputSchema: timeseriesShow,
  metadata: { title: "Show time series", annotations: readOnly, _meta: { ui: { resourceUri: TIMESERIES_CARD_URI } } },
}).server<Context>(async (input, ctx) => {
  const zone = knownTimeZone(input.timeZone)
  const shown = inTimeZoneOf(await showTimeseries(ctx.context.apis, input.lines, input.range), zone)
  return inWords(shown, `${timeseriesShowInWords(shown)}\n\n${shownAsCard}`)
})

const timeseriesSeriesTool = toolDefinition({
  name: TIMESERIES_SERIES_TOOL,
  description:
    "List the values of the lines of a time series card over a range, on the same instants: what its graph draws. The card calls it after genui_timeseries_show, and again when a person changes the range or the lines. A language model does not need it: the newest, smallest and largest value of each line are in the result of genui_timeseries_show.",
  inputSchema: z.object({
    lines: lines.describe("The pairs to draw, as genui_timeseries_show takes them; a signal by its path below the machine is quickest."),
    range: range.optional(),
    to: instant.optional().describe("Where the range ends: `to` of genui_timeseries_show, so the graph shows what the words said. Now if omitted."),
    points: z
      .number()
      .int()
      .min(10)
      .max(2000)
      .optional()
      .describe(`About how many values the Timeseries API keeps of a line of numbers, ${TIMESERIES_POINTS} if omitted. A yes or no is read whole.`),
  }),
  outputSchema: timeseriesSeries,
  // Only a card calls this tool: a host that shows MCP Apps does not offer it to its language model.
  metadata: { title: "List time series lines", annotations: readOnly, _meta: { ui: { visibility: ["app"] } } },
}).server<Context>(async (input, ctx) => {
  const series = await listTimeseriesSeries(ctx.context.apis, input.lines, input.range, input.to, input.points)
  return inWords(
    series,
    `${series.lines.length} lines on ${series.instants.length} instants from ${series.from} to ${series.to}, for the graph of the time series card. What each line is now is the result of genui_timeseries_show.`,
  )
})

const timeseriesSignalsTool = toolDefinition({
  name: TIMESERIES_SIGNALS_TOOL,
  description:
    "List what each machine published in the last 24 hours that a time series can draw: its numbers and yes or no, by path below the machine. The time series card calls it when a person adds a line. A language model does not need it: genui_timeseries_show names the signals of a machine when it does not know one.",
  inputSchema: z.object({}),
  outputSchema: timeseriesSignals,
  // Only a card calls this tool.
  metadata: { title: "List time series signals", annotations: readOnly, _meta: { ui: { visibility: ["app"] } } },
}).server<Context>(async (_input, ctx) => {
  const signals = await listTimeseriesSignals(ctx.context.apis)
  const count = signals.machines.reduce((sum, one) => sum + one.signals.length, 0)
  return inWords(signals, `${count} signals of ${signals.machines.length} machines, for the time series card to offer.`)
})

const timeseriesGuide = `## Time series

\`genui_timeseries_show\` draws signals of machines over a range (\`range\`: 15m, 1h, 8h or 24h, ${TIMESERIES_RANGE} if
omitted), a line for each pair in \`lines\`, freely combined: the active power of two machines and the bearing
temperature of one, say. At most ${MOST_LINES} lines, and numbers of at most ${MOST_UNITS} units, one for each y axis
of the card. Pass the \`timeZone\` of the person you answer, if you know it.

These \`genui_timeseries_*\` tools answer a question with the time series card. The tools named \`timeseries_*\`,
without \`genui_\`, belong to the Timeseries API and return its stored values as they are: take them only where a
person asks for the raw values.

Name a signal by its path below the machine, \`umati/Spindle/1/Override\` or \`oem/Spindle/1/BearingTemperature\`,
by the element of the data model, \`Spindle.1.Override\`, or by a quantity of the measurement card, such as
\`activePower\` or \`bearingTemperature\`. A signal must be a number or a yes or no that the machine published in
the last 24 hours. If it is not, the tool says which signals the machine has: take one of those.

For each line: \`now\`, the newest value, and \`stale\` if the machine was silent since; \`low\` and \`high\`, the
smallest and largest value in the range. Every value keeps the unit it was published in (\`unit\`). Say it in that
unit, and do not convert it. There is no mean: a value published only when it changes has none that means
something.

The values over the range are what the card draws. They grow with time, so they are not in that result: the card
asks \`genui_timeseries_series\` for them itself, and \`genui_timeseries_signals\` for what a person can add. You need neither.
`

export const timeseriesCard = card({
  tools: [timeseriesShowTool, timeseriesSeriesTool, timeseriesSignalsTool],
  describes: [
    "- genui_timeseries_show: signals of machines over the last 15 minutes to 24 hours, a line for each pair of a machine and a signal.",
    "- genui_timeseries_series: the values of those lines, for the graph of the card. A card calls it.",
    "- genui_timeseries_signals: what each machine published that a time series can draw. A card calls it.",
  ],
  guide: timeseriesGuide,
  file: { name: "timeseries", uri: TIMESERIES_CARD_URI },
})
