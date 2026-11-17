import { z } from "zod"

import { instant, serialNumber } from "../machine/contract.ts"

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
  machine: serialNumber.describe("The serial number, which identifies the machine in every topic."),
  energy: z.object({
    joule: z
      .number()
      .nullable()
      .describe(
        "The energy imported between `start` and `end`: the meter at `end` less the meter at `start`, in joule. Null if the meter had no value, or if it went back in between (`meterWentBack`): then it is not known.",
      ),
    start: meterReading
      .nullable()
      .describe(
        "The value of the meter the energy is counted from: the newest at or before `from` of the result, however old, or the first after it if the meter had none before.",
      ),
    end: meterReading.nullable().describe("The value of the meter the energy is counted to: the newest at or before `to` of the result."),
    meterWentBack: z.boolean().describe("True if the meter at `end` is less than at `start`: it was reset in between."),
    topic: z.string().describe("The MQTT topic of the meter."),
  }),
  power: z.object({
    meanWatt: z
      .number()
      .nullable()
      .describe("The mean of the values of active power published between `from` and `to`, in watt: while the machine published, not over silence. Null if there was none."),
    peakWatt: z.number().nullable().describe("The largest of those values, in watt. Null if there was none."),
    values: z.number().int().describe("How many values of active power the mean and the peak are taken from."),
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
  machine: serialNumber,
  topic: z.string().describe("The MQTT topic of the active power."),
  watt: z
    .array(z.number().nullable())
    .describe(
      "One value for each of `instants` of the result, in that order: the mean of the values of the slot that ends there. Null where the machine published none.",
    ),
})
export type PowerLine = z.infer<typeof powerLine>

/**
 * The active power of machines over the hours of an energy card: what its graph draws, a line for
 * each machine. It grows with time, so it is not part of what a language model reads: whoever
 * draws the card asks for it with the `from`, `to` and machines of the card.
 *
 * Every line has the same instants, so they stand once, in `instants`, and a line carries only its
 * values. A slot takes the values the Timeseries API keeps when it thins a line to twice as many
 * points as there are slots (LTTB), all of them where there are fewer.
 */
export const energySeries = z.object({
  from: instant,
  to: instant,
  instants: z.array(instant).describe("The end of each slot, oldest first: the same for every line."),
  lines: z.array(powerLine).describe("One for each machine asked for that published active power between `from` and `to`."),
})
export type EnergySeries = z.infer<typeof energySeries>
