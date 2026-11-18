import { z } from "zod"

import { SILENT_AFTER_SECONDS, instant, machineId } from "../machine/contract.ts"

// The contract of the time series card: signals a person names, of any machine, over the last minutes
// or hours, a line for each pair of a machine and a signal. Every value keeps the unit it was
// published in and names the topic it comes from; nothing is converted (ADR-0002, ADR-0015).

/** The ranges the card offers, the shortest first. */
export const TIMESERIES_RANGES = ["15m", "1h", "8h", "24h"] as const
export const timeseriesRange = z.enum(TIMESERIES_RANGES)
export type TimeseriesRange = z.infer<typeof timeseriesRange>

/** The range if nobody asks for another. */
export const TIMESERIES_RANGE: TimeseriesRange = "1h"

/** How long each range is, in seconds. */
export const RANGE_SECONDS: Record<TimeseriesRange, number> = { "15m": 15 * 60, "1h": 60 * 60, "8h": 8 * 60 * 60, "24h": 24 * 60 * 60 }

/** How many lines a card draws at most: more do not read, and each costs a query over the whole range. */
export const MOST_LINES = 8

/** How many units the numbers of one card have at most: one for each y axis, left and right. */
export const MOST_UNITS = 2

/** How many values the Timeseries API keeps of a line of numbers if nobody asks for more or less. */
export const TIMESERIES_POINTS = 480

/** A number in a unit, or a yes or no. A text is no line. */
export const signalKind = z.enum(["number", "yesNo"])
export type SignalKind = z.infer<typeof signalKind>

/** One pair as a caller names it. */
export const askedLine = z.object({
  machine: machineId.describe("The machine id, for example alcyone-machines_AX-400_P-04. genui_machine_list names every machine with its id."),
  signal: z
    .string()
    .min(1)
    .describe(
      "The signal of that machine: its path below the machine (umati/Spindle/1/Override, oem/Spindle/1/BearingTemperature), the element of the data model (Spindle.1.Override, x-alcyone-machines-example.Spindle.1.BearingTemperature), or a quantity of the measurement card (activePower, energyImported, bearingTemperature, spindleRotating, feedOverride, spindleOverride, powerOnDuration).",
    ),
})
export type AskedLine = z.infer<typeof askedLine>

export const timeseriesLine = z.object({
  machine: machineId,
  signal: z.string().describe("The signal as it was asked for."),
  path: z.string().describe("Where the signal lies below the machine, for example umati/Spindle/1/Override."),
  topic: z.string().describe("The MQTT topic the values come from."),
  kind: signalKind,
  unit: z.string().nullable().describe("The unit the values were published in, for example watt. Null for a yes or no."),
  now: z
    .object({
      value: z.union([z.number(), z.boolean()]).describe("The newest value, in `unit`."),
      at: instant.describe("When it was measured."),
      stale: z
        .boolean()
        .describe(
          `True if the machine was silent since, more than ${SILENT_AFTER_SECONDS} seconds without a sign of life: then it is the last value known, not what the machine measures now.`,
        ),
    })
    .nullable()
    .describe("The newest value of the topic up to `to`, or null if it never had one."),
  low: z.number().nullable().describe("The smallest value published between `from` and `to`, in `unit`. Null for a yes or no, or without a value."),
  high: z.number().nullable().describe("The largest value published between `from` and `to`, in `unit`. Null for a yes or no, or without a value."),
  values: z
    .number()
    .int()
    .nullable()
    .describe("How many numbers the topic had between `from` and `to`. Null for a yes or no, which is not counted: it holds until it changes."),
})
export type TimeseriesLine = z.infer<typeof timeseriesLine>

/** The time series card: the lines asked for, in that order, over the last `range`. */
export const timeseriesShow = z.object({
  from: instant,
  to: instant,
  range: timeseriesRange,
  lines: z.array(timeseriesLine),
})
export type TimeseriesShow = z.infer<typeof timeseriesShow>

/** Why a line has no value at all. */
export const lineNote = z.enum(["noValues", "text"])
export type LineNote = z.infer<typeof lineNote>

export const seriesLine = z.object({
  machine: machineId,
  path: z.string().describe("Where the signal lies below the machine."),
  topic: z.string().describe("The MQTT topic the values come from."),
  kind: signalKind,
  unit: z.string().nullable().describe("The unit the values were published in. Null for a yes or no."),
  values: z
    .array(z.union([z.number(), z.boolean()]).nullable())
    .describe(
      `One for each of \`instants\` of the result: the value that held there, the newest one before it of those read. Null before the first, and where the machine was silent since, more than ${SILENT_AFTER_SECONDS} seconds without a sign of life.`,
    ),
  note: lineNote
    .nullable()
    .describe("Why the line has no value: the topic had none in the range (noValues), or it carries text, which draws no line (text). Null if it has values."),
})
export type SeriesLine = z.infer<typeof seriesLine>

/**
 * The lines of a time series card: what its graph draws. It grows with time, so it is not part of what
 * a language model reads: the card asks for it itself, and again when a person changes the range
 * or the lines.
 *
 * The instants are those of the values themselves: every instant at which one of the lines has a
 * value, and where the range begins and ends. So a value the Timeseries API kept when it thinned a
 * line of numbers (LTTB) stays in the line with its own instant, and a peak with it. At the instants
 * of the other lines a line has the value that held. A yes or no is read whole, never thinned.
 */
export const timeseriesSeries = z.object({
  from: instant,
  to: instant,
  range: timeseriesRange,
  instants: z.array(instant).describe("Oldest first, the same for every line."),
  lines: z
    .array(seriesLine)
    .describe("One for each topic asked for, in the order first asked: a line asked twice, also by two names, is one."),
})
export type TimeseriesSeries = z.infer<typeof timeseriesSeries>

export const machineSignals = z.object({
  machine: machineId,
  signals: z
    .array(z.object({ path: z.string().describe("Where the signal lies below the machine."), kind: signalKind }))
    .describe("Every number and yes or no the machine published in the last 24 hours, by path."),
})
export type MachineSignals = z.infer<typeof machineSignals>

/** What a person can add to a time series card: the signals of each machine. */
export const timeseriesSignals = z.object({
  asOf: instant,
  machines: z.array(machineSignals),
})
export type TimeseriesSignals = z.infer<typeof timeseriesSignals>
