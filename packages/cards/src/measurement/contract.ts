import { z } from "zod"

import { SILENT_AFTER_SECONDS, instant, machineId } from "../machine/contract.ts"

// The contract of the measurement card: what every machine measures now. Each value is the
// newest one of its topic, in the unit it was published in, and names the topic it comes from.

/** The physical quantities the card shows, in the order it shows them. */
export const QUANTITIES = [
  "activePower",
  "energyImported",
  "bearingTemperature",
  "spindleRotating",
  "feedOverride",
  "spindleOverride",
  "powerOnDuration",
] as const
export const quantity = z.enum(QUANTITIES)
export type Quantity = z.infer<typeof quantity>

/**
 * Where each quantity is published, below `machines/{machineId}/`: the elements of the umati data
 * model below `umati/`, the signals of the machine manufacturer below `oem/`. The backend reads the
 * stored values of these topics, and a page that is live subscribes to them at the broker.
 */
export const QUANTITY_PATHS: Record<Quantity, string> = {
  activePower: "umati/Consumption/Electricity/Main/AcActivePowerTotal",
  energyImported: "umati/Consumption/Electricity/Main/AcActiveEnergyTotalImportHp",
  bearingTemperature: "oem/Spindle/1/BearingTemperature",
  spindleRotating: "umati/Spindle/1/IsRotating",
  feedOverride: "umati/State/FeedOverride",
  spindleOverride: "umati/Spindle/1/Override",
  powerOnDuration: "umati/OperationCounters/PowerOnDuration",
}

export const measurement = z.object({
  quantity,
  value: z
    .union([z.number(), z.boolean()])
    .nullable()
    .describe("The newest value of the topic, or null if it had none. A number is in `unit`."),
  unit: z
    .string()
    .nullable()
    .describe("The unit the value was published in, as the MQTT binding names it, for example watt. Null for a yes or no."),
  at: instant.nullable().describe("When the newest value was measured."),
  stale: z
    .boolean()
    .describe(
      `True if the machine was silent since the newest value, more than ${SILENT_AFTER_SECONDS} seconds without a sign of life, or if there is none: then it is not what the machine measures now. A value holds until the next one, however old, as long as the machine is there.`,
    ),
  topic: z.string().describe("The MQTT topic the value comes from."),
})
export type Measurement = z.infer<typeof measurement>

export const machineMeasurements = z.object({
  machine: machineId.describe("The machine id, which identifies the machine in every topic."),
  measurements: z.array(measurement).describe("One for each quantity, in the order of `QUANTITIES`."),
})
export type MachineMeasurements = z.infer<typeof machineMeasurements>

/** The measurement card: what every machine measures now. */
export const measurementList = z.object({
  asOf: instant,
  machines: z.array(machineMeasurements),
})
export type MeasurementList = z.infer<typeof measurementList>

/** How many points a line of a graph has: one every five seconds over a quarter of an hour. */
export const SERIES_SLOTS = 180

/** A value of a line at one instant. */
export const lineValue = z
  .union([z.number(), z.boolean()])
  .nullable()
  .describe(
    `The value that held at its instant: the newest one measured before. Null if there is none, or if the machine was silent since, more than ${SILENT_AFTER_SECONDS} seconds without a sign of life.`,
  )
export type LineValue = z.infer<typeof lineValue>

export const measurementLine = z.object({
  machine: machineId,
  topic: z.string().describe("The MQTT topic the values come from."),
  values: z.array(lineValue).describe("One for each of `instants` of the result, in that order."),
})
export type MeasurementLine = z.infer<typeof measurementLine>

/**
 * The values of every machine over the last minutes: what the graphs of the measurements draw,
 * one graph for each quantity and a line for each machine in it. They grow with time, so they are
 * not part of what a language model reads: the card file and the page that draw the graphs ask
 * for them.
 *
 * Every line has the same instants, so they stand once, in `instants`, and a line carries only
 * its values: a result is a fraction of the size, and a page reads it again every few seconds.
 */
export const measurementSeries = z.object({
  from: instant,
  to: instant,
  instants: z.array(instant).describe("The end of each slot, oldest first: the same for every line."),
  quantities: z.array(
    z.object({
      quantity,
      unit: z.string().nullable().describe("The unit the values were published in. Null for a yes or no."),
      lines: z.array(measurementLine).describe("One for each machine that published the quantity between `from` and `to`."),
    }),
  ),
})
export type MeasurementSeries = z.infer<typeof measurementSeries>
