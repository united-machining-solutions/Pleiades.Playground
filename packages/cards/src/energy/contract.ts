import { z } from "zod"

import { SILENT_AFTER_SECONDS, instant, machineId } from "../machine/contract.ts"

// The contract of the energy card: how much energy each machine imported over the last hours, from
// its meter, and how much power it drew, from its active power. Every value is in the unit of the
// MQTT binding, joule and watt, and names the topic it comes from. Kilowatt hours are wording only.

/** How many hours back the card looks if nobody asks for more or less, and at most. */
export const ENERGY_HOURS = 8
export const MOST_ENERGY_HOURS = 24

/** How many values a line of the graph has if nobody asks: one for every few pixels of a card. */
export const ENERGY_SLOTS = 240

/** A value of the meter: what it counted, and when. */
export const meterReading = z.object({
  joule: z.number().describe("What the meter had counted, in joule."),
  at: instant.describe("When the meter published it."),
})
export type MeterReading = z.infer<typeof meterReading>

export const machineEnergy = z.object({
  machine: machineId.describe("The machine id, which identifies the machine in every topic."),
  energy: z.object({
    joule: z
      .number()
      .nullable()
      .describe(
        "The energy imported between `start` and `end`: the meter at `end` less the meter at `start`, in joule. Null if it is not known: the meter had no value (`unit` null), published in another unit than joule (`unit`), or went back in between (`meterWentBack`).",
      ),
    start: meterReading
      .nullable()
      .describe(
        `The value of the meter the energy is counted from: the newest at or before \`from\` of the result if it is at most ${SILENT_AFTER_SECONDS} seconds older, else the first after it. An older value may lie before a gap in which the machine imported energy outside these hours.`,
      ),
    end: meterReading.nullable().describe("The value of the meter the energy is counted to: the newest at or before `to` of the result."),
    meterWentBack: z.boolean().describe("True if the meter at `end` is less than at `start`: it was reset in between."),
    unit: z.string().nullable().describe("The unit the meter published in: joule, as the MQTT binding wants. Null if it had no value."),
    topic: z.string().describe("The MQTT topic of the meter."),
  }),
  power: z.object({
    meanWatt: z
      .number()
      .nullable()
      .describe("The mean of the values of active power published between `from` and `to`, in watt: while the machine published, not over silence. Null if there was none."),
    peakWatt: z.number().nullable().describe("The largest of those values, in watt. Null if there was none."),
    values: z.number().int().describe("How many values of active power the mean and the peak are taken from."),
    unit: z
      .string()
      .nullable()
      .describe("The unit the active power was published in: watt, as the MQTT binding wants. Null if there was no value. In another unit, mean and peak are null."),
    topic: z.string().describe("The MQTT topic of the active power."),
  }),
})
export type MachineEnergy = z.infer<typeof machineEnergy>

/**
 * The energy card: the machines that published active power or their meter between `from` and
 * `to`, the one that imported the most first. Values whose unit is not joule or watt are left out.
 */
export const energyShow = z.object({
  from: instant,
  to: instant,
  hours: z.number().int().describe("The hours from `from` to `to`."),
  machines: z.array(machineEnergy),
})
export type EnergyShow = z.infer<typeof energyShow>

/** A line of the graph: the active power of one machine, on the instants of the result. */
export const powerLine = z.object({
  machine: machineId,
  topic: z.string().describe("The MQTT topic of the active power."),
  watt: z
    .array(z.number().nullable())
    .describe(
      `One value for each of \`instants\` of the result, in that order: the value that held there, the newest of those the Timeseries API kept. Null before the first, and where the machine was silent since, more than ${SILENT_AFTER_SECONDS} seconds without a sign of life.`,
    ),
})
export type PowerLine = z.infer<typeof powerLine>

/**
 * The active power of machines over the hours of an energy card: what its graph draws, a line for
 * each machine. It grows with time, so it is not part of what a language model reads: whoever
 * draws the card asks for it with the `from`, `to` and machines of the card.
 *
 * Every line has the same instants, so they stand once, in `instants`, and a line carries only its
 * values. They are the values the Timeseries API keeps when it thins a line to twice as many
 * points as there are slots (LTTB), all of them where there are fewer: they draw the shape of the
 * line, and its mean and peak are in the result of the card.
 */
export const energySeries = z.object({
  from: instant,
  to: instant,
  instants: z.array(instant).describe("The end of each slot, oldest first: the same for every line."),
  lines: z.array(powerLine).describe("One for each machine asked for that published active power between `from` and `to`."),
})
export type EnergySeries = z.infer<typeof energySeries>
