import { ENERGY_HOURS, ENERGY_SLOTS, MOST_ENERGY_HOURS, energySeries, energyShow } from "@pleiades/cards/energy/contract.ts"
import { energyShowInWords } from "@pleiades/cards/energy/in-words.ts"
import { MACHINE_NAMING, instant, machineId } from "@pleiades/cards/machine/contract.ts"
import { toolDefinition } from "@tanstack/ai"
import { z } from "zod"

import { card } from "../card.ts"
import { listEnergySeries, showEnergy } from "../energy.ts"
import { inTimeZoneOf, knownTimeZone } from "../time.ts"
import { inWords, readOnly, timeZone } from "../tool.ts"
import type { Context } from "../tool.ts"

import { ENERGY_CARD_URI, ENERGY_SERIES_TOOL } from "./energy.names.ts"

// The energy card: how much energy machines imported over the last hours, with mean and peak
// power, and the graph of their power, which the card asks for itself. What computes it is in
// energy.ts.

export { ENERGY_CARD_URI, ENERGY_SERIES_TOOL }

const shownAsCard =
  "Where the host shows MCP Apps, the person already sees this result as the energy card: the energy of each machine as a bar with mean and peak power, and the power over these hours as a graph. Then a sentence or two is the whole answer. Do not list the values again."

const machines = z.array(machineId.describe(MACHINE_NAMING)).min(1).optional()

/** A card names the machines by the ids of a result. */
const machineIds = z.array(machineId.describe("The machine id: `machine` of a machine of genui_energy_show.")).min(1).optional()

const energyShowTool = toolDefinition({
  name: "genui_energy_show",
  description:
    "Show how much energy machines imported over the last hours, from the meter of each machine, with the mean and the peak of their active power. Every machine, or those named in `machines`; the one that imported the most first. Use it to compare machines or for the energy of one. The result says it in a line for each machine, in kilowatt hours, and carries the values of the energy card in the unit of each meter and in watt.",
  inputSchema: z.object({
    machines: machines.describe("The machines to compare. Every machine that published active power or its meter if omitted."),
    hours: z
      .number()
      .int()
      .min(1)
      .max(MOST_ENERGY_HOURS)
      .optional()
      .describe(`How many hours back, up to now. ${ENERGY_HOURS} if omitted. The card offers 1, 8 and 24.`),
    timeZone,
  }),
  outputSchema: energyShow,
  metadata: { title: "Show energy", annotations: readOnly, _meta: { ui: { resourceUri: ENERGY_CARD_URI } } },
}).server<Context>(async (input, ctx) => {
  const zone = knownTimeZone(input.timeZone)
  const shown = inTimeZoneOf(await showEnergy(ctx.context.apis, input.hours, input.machines), zone)
  return inWords(shown, `${energyShowInWords(shown)}\n\n${shownAsCard}`)
})

const energySeriesTool = toolDefinition({
  name: ENERGY_SERIES_TOOL,
  description:
    "List the active power of machines between two instants, a line for each machine on the same instants: what the graph of the energy card draws. The card calls it after genui_energy_show, with `from`, `to` and the machines of that result. A language model does not need it: the energy, mean and peak are in the result of genui_energy_show.",
  inputSchema: z.object({
    from: instant.describe("Where the lines begin: `from` of genui_energy_show."),
    to: instant.describe(`Where they end: \`to\` of genui_energy_show. At most ${MOST_ENERGY_HOURS} hours after \`from\`.`),
    machines: machineIds.describe("The machines to draw, in the order of their colours. Every machine that published active power if omitted."),
    slots: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe(
        `How many values a line has, ${ENERGY_SLOTS} if omitted: about one for every few pixels of the graph. Each is the value that held at its instant, none where the machine was silent; the instants stand once in the result, the same for every line.`,
      ),
  }),
  outputSchema: energySeries,
  // Only a card calls this tool: a host that shows MCP Apps does not offer it to its language model.
  metadata: { title: "List energy series", annotations: readOnly, _meta: { ui: { visibility: ["app"] } } },
}).server<Context>(async (input, ctx) => {
  const series = await listEnergySeries(ctx.context.apis, input.from, input.to, input.machines, input.slots)
  return inWords(
    series,
    `${series.lines.length} lines of active power from ${series.from} to ${series.to}, for the graph of the energy card. The energy of each machine is the result of genui_energy_show.`,
  )
})

const energyGuide = `## Energy

\`genui_energy_show\` says how much energy machines imported over the last hours (\`hours\`, ${ENERGY_HOURS} if
omitted, at most ${MOST_ENERGY_HOURS}), every machine or those in \`machines\`. Machines in watt hours come first,
then those in joule, each the one that imported the most first. Pass the \`timeZone\` of the person you answer,
if you know it.

- \`energy.value\` in \`energy.unit\`: the meter \`umati/Consumption/Electricity/Main/AcActiveEnergyTotalImportHp\`
  at \`end\` less at \`start\`, in the unit the meter published in, unconverted: \`wattHour\`, as the data model
  has it, or \`joule\` for values from before it. Null if it is not known, and the result says why: the meter
  had no value (\`unit\` null), published in a unit that is not one of energy (\`unit\`), changed its unit
  (\`start.unit\`, \`end.unit\`), or went back (\`meterWentBack\`, a reset). A value of the meter from before a gap
  is not counted: then it counts from its first value in these hours.
- \`power.meanWatt\`: the mean power over the time the energy covers, weighted by time: the energy divided
  by the time between its two values of the meter, in watt; 0 where the meter did not change. Null where the
  energy is not known.
- \`power.peakWatt\`: the largest value of \`umati/Consumption/Electricity/Main/AcActivePowerTotal\` in these
  hours, in watt. Null if there was no value, if it was published in another unit than watt (\`power.unit\`),
  or if the statistics of the Timeseries API did not answer (\`power.error\`).

On the wire the energy keeps the unit of the meter. Say it to a person in kilowatt hours, as the text of
the result does; it has converted them for you (ADR-0017). Compare the machines with the words of the result; do not
add, divide or convert the numbers yourself. That holds for the energy over these hours: a value of the meter
itself, as \`genui_measurement_list\` gives it, stays in the unit it was published in, as the section on
measurements says.

The power over these hours, a line for each machine, is what the graph of the card draws. It grows
with time, so it is not in that result: the card asks \`genui_energy_series\` for it itself. You do not
need it.
`

export const energyCard = card({
  tools: [energyShowTool, energySeriesTool],
  describes: [
    "- genui_energy_show: the energy machines imported over the last hours, with mean and peak power.",
    "- genui_energy_series: the active power of machines over those hours, for the graph of the card. A card calls it.",
  ],
  guide: energyGuide,
  file: { name: "energy", uri: ENERGY_CARD_URI },
})
