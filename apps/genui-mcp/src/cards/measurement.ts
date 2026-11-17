import { serialNumber } from "@pleiades/cards/machine/contract.ts"
import { SERIES_SLOTS, measurementList, measurementSeries } from "@pleiades/cards/measurement/contract.ts"
import { measurementListInWords } from "@pleiades/cards/measurement/in-words.ts"
import { toolDefinition } from "@tanstack/ai"
import { z } from "zod"

import { card } from "../card.ts"
import { MOST_MINUTES, SERIES_MINUTES, listMeasurementSeries, listMeasurements } from "../measurements.ts"
import { inTimeZoneOf, knownTimeZone } from "../time.ts"
import { inWords, readOnly, timeZone } from "../tool.ts"
import type { Context } from "../tool.ts"

import { MEASUREMENT_CARD_URI, MEASUREMENT_SERIES_TOOL } from "./measurement.names.ts"

// The measurement card: the newest physical values of every machine, and the graphs of the last
// minutes, which the card asks for itself. What reads them is in measurements.ts.

export { MEASUREMENT_CARD_URI, MEASUREMENT_SERIES_TOOL }

const shownAsCard =
  "Where the host shows MCP Apps, the person already sees this result as the measurement card: a card for each machine with these values, and graphs of the last minutes. Then a sentence or two is the whole answer. Do not list the values again."

const measurementListTool = toolDefinition({
  name: "genui_measurement_list",
  description:
    "List what every machine measures now, or one machine with `machine`: active power, energy imported, spindle bearing temperature, whether the spindle rotates, feed and spindle override, and power-on duration. Each is the newest value of its topic, in the unit it was published in, and says whether it is current. The result says it in a line for each machine and carries the values of the measurement card. For a question about one machine, name it.",
  inputSchema: z.object({
    machine: serialNumber
      .optional()
      .describe("The serial number of one machine, for example P-04. Every machine if omitted."),
    timeZone,
  }),
  outputSchema: measurementList,
  metadata: { title: "List measurements", annotations: readOnly, _meta: { ui: { resourceUri: MEASUREMENT_CARD_URI } } },
}).server<Context>(async (input, ctx) => {
  const zone = knownTimeZone(input.timeZone)
  const list = inTimeZoneOf(await listMeasurements(ctx.context.apis, new Date(), input.machine), zone)
  return inWords(list, `${measurementListInWords(list)}\n\n${shownAsCard}`)
})

const measurementSeriesTool = toolDefinition({
  name: MEASUREMENT_SERIES_TOOL,
  description:
    "List the values of every physical quantity of every machine over the last minutes, a line for each machine: what the graphs of the measurements draw. The measurement card calls it after genui_measurement_list. A language model does not need it to say what a machine measures now: that is genui_measurement_list.",
  inputSchema: z.object({
    minutes: z
      .number()
      .int()
      .min(1)
      .max(MOST_MINUTES)
      .optional()
      .describe(`How many minutes back the lines go. ${SERIES_MINUTES} if omitted.`),
    slots: z
      .number()
      .int()
      .min(1)
      .max(2000)
      .optional()
      .describe(
        `How many values a line has, ${SERIES_SLOTS} if omitted. Each is the value that held at the end of its slot; the instants stand once in the result, the same for every line.`,
      ),
  }),
  outputSchema: measurementSeries,
  // Only a card calls this tool: a host that shows MCP Apps does not offer it to its language model.
  // The card file asks for it through its host, the page "Live values" of the example app itself.
  metadata: { title: "List measurement series", annotations: readOnly, _meta: { ui: { visibility: ["app"] } } },
}).server<Context>(async (input, ctx) => {
  const series = await listMeasurementSeries(ctx.context.apis, input.minutes, input.slots)
  const lines = series.quantities.reduce((sum, one) => sum + one.lines.length, 0)
  return inWords(
    series,
    `${lines} lines of ${series.quantities.length} quantities from ${series.from} to ${series.to}, for the graphs of the measurements. What every machine measures now is the result of genui_measurement_list.`,
  )
})

const measurementGuide = `## Measurements

\`genui_measurement_list\` lists every machine that published a value in the last 24 hours, with the
newest value of each physical quantity. Pass the \`timeZone\` of the person you answer, if you know it.

- \`activePower\`: \`umati/Consumption/Electricity/Main/AcActivePowerTotal\`, in watt.
- \`energyImported\`: \`umati/Consumption/Electricity/Main/AcActiveEnergyTotalImportHp\`, a meter in joule
  that counts up.
- \`bearingTemperature\`: \`vendor/Spindle/1/BearingTemperature\`, a value of the manufacturer.
- \`spindleRotating\`: \`umati/Spindle/1/IsRotating\`, yes or no.
- \`feedOverride\`, \`spindleOverride\`: \`umati/State/FeedOverride\`, \`umati/Spindle/1/Override\`, a
  fraction in \`one\`: 1 is 100 percent.
- \`powerOnDuration\`: \`umati/OperationCounters/PowerOnDuration\`, in seconds.

Every value keeps the unit it was published in (\`unit\`). Say it in that unit, and do not convert it.
For a question about one machine, pass \`machine\`. A value holds until the next one of its topic, as
long as the machine gives signs of life. \`stale\` is true where the machine was silent since, more
than 30 seconds without a sign of life, or where there is no value: then it is
the last value known, not what the machine measures now.

The values over the last minutes, a line for each machine, are what a graph draws. They grow with
time, so they are not in that result: the card asks \`genui_measurement_series\` for them itself.
You do not need it.
`

export const measurementCard = card({
  tools: [measurementListTool, measurementSeriesTool],
  describes: [
    "- genui_measurement_list: every machine with the newest value of each physical quantity.",
    "- genui_measurement_series: the values of every quantity over the last minutes, for the graphs of the card. A card calls it.",
  ],
  guide: measurementGuide,
  file: { name: "measurement", uri: MEASUREMENT_CARD_URI },
})
