import { z } from "zod"

import { SILENT_AFTER_SECONDS, instant, serialNumber } from "../machine/contract.ts"

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
  machine: serialNumber.describe("The serial number, which identifies the machine in every topic."),
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

export const point = z.object({
  at: instant.describe("The end of a slot. Every line of a result has the same instants."),
  value: z
    .union([z.number(), z.boolean()])
    .nullable()
    .describe(
      `The value that held at \`at\`: the newest one measured before. Null if there is none, or if the machine was silent since, more than ${SILENT_AFTER_SECONDS} seconds without a sign of life.`,
    ),
})
export type Point = z.infer<typeof point>

export const measurementLine = z.object({
  machine: serialNumber,
  topic: z.string().describe("The MQTT topic the values come from."),
  points: z.array(point).describe("The values between `from` and `to`, one for each slot, oldest first."),
})
export type MeasurementLine = z.infer<typeof measurementLine>

/**
 * The values of every machine over the last minutes: what the graphs of the measurements draw,
 * one graph for each quantity and a line for each machine in it. They grow with time, so they are
 * not part of what a language model reads: a page that draws the graphs asks for them.
 */
export const measurementSeries = z.object({
  from: instant,
  to: instant,
  quantities: z.array(
    z.object({
      quantity,
      unit: z.string().nullable().describe("The unit the values were published in. Null for a yes or no."),
      lines: z.array(measurementLine).describe("One for each machine that published the quantity between `from` and `to`."),
    }),
  ),
})
export type MeasurementSeries = z.infer<typeof measurementSeries>
