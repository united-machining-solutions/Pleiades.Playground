import { z } from "zod"

import { SILENT_AFTER_SECONDS, instant, machineId } from "../machine/contract.ts"

// The contract of the energy card: how much energy each machine imported over the last hours, from
// its meter, and how much power it drew, from its active power. Every value keeps the unit it was
// published in, and names the topic it comes from: a machine meters in watt hours, as the data
// model has it, a value from before in joule (ADR-0002, ADR-0015). Kilowatt hours are wording only.

/** The units a meter of energy may publish in, in the order the card lists machines by unit. */
export const ENERGY_UNITS = ["wattHour", "joule"] as const
export type EnergyUnit = (typeof ENERGY_UNITS)[number]

/** How many hours back the card looks if nobody asks for more or less, and at most. */
export const ENERGY_HOURS = 8
export const MOST_ENERGY_HOURS = 24

/** How many values a line of the graph has if nobody asks: one for every few pixels of a card. */
export const ENERGY_SLOTS = 240

/** A value of the meter: what it counted, in which unit, and when. */
export const meterReading = z.object({
  value: z.number().describe("What the meter had counted, in `unit`."),
  unit: z.string().nullable().describe("The unit the meter published it in: wattHour, or joule for a value from before the data model 0.17.1."),
  at: instant.describe("When the meter published it."),
})
export type MeterReading = z.infer<typeof meterReading>

export const machineEnergy = z.object({
  machine: machineId.describe("The machine id, which identifies the machine in every topic."),
  energy: z.object({
    value: z
      .number()
      .nullable()
      .describe(
        "The energy imported between `start` and `end`: the meter at `end` less the meter at `start`, in `unit`, unconverted. Null if it is not known: the meter had no value (`unit` null), published in a unit that is not one of energy (`unit`), changed its unit in between (`start.unit` and `end.unit`), or went back (`meterWentBack`).",
      ),
    start: meterReading
      .nullable()
      .describe(
        `The value of the meter the energy is counted from: the newest at or before \`from\` of the result, if the machine was there since, without a silence of more than ${SILENT_AFTER_SECONDS} seconds, else its first value after \`from\`. A value before a silence may lie before a gap in which the machine imported energy outside these hours.`,
      ),
    end: meterReading.nullable().describe("The value of the meter the energy is counted to: the newest at or before `to` of the result."),
    meterWentBack: z.boolean().describe("True if the meter at `end` is less than at `start`: it was reset in between."),
    unit: z
      .string()
      .nullable()
      .describe("The unit of `value`: the one the meter published in, wattHour or joule. Null if it had no value."),
    topic: z.string().describe("The MQTT topic of the meter."),
  }),
  power: z.object({
    meanWatt: z
      .number()
      .nullable()
      .describe(
        "The mean power over the time the energy covers, weighted by time: the energy divided by the time from `start.at` to `end.at`, in watt (a watt hour an hour, or a joule a second); 0 where the meter did not change. Null if the energy is not known.",
      ),
    peakWatt: z
      .number()
      .nullable()
      .describe("The largest value of active power published between `from` and `to`, in watt. Null if there was none, or if the statistics did not answer (`error`)."),
    values: z.number().int().describe("How many values of active power the peak is taken from."),
    unit: z
      .string()
      .nullable()
      .describe("The unit the active power was published in: watt, as the MQTT binding wants. Null if there was no value. In another unit, the peak is null."),
    error: z
      .string()
      .nullable()
      .describe("Why the peak is not known although the machine may have published power: the statistics of the Timeseries API did not answer. Null otherwise."),
    topic: z.string().describe("The MQTT topic of the active power."),
  }),
})
export type MachineEnergy = z.infer<typeof machineEnergy>

/**
 * The energy card: the machines that published active power or their meter between `from` and
 * `to`. Those in watt hours first, then those in joule, each the one that imported the most first,
 * and those whose energy is not known last: energies in two units are not compared, since nothing
 * here converts. A meter in another unit than these, or a power in another than watt, is not read.
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
