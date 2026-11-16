import { SILENT_AFTER_SECONDS } from "@pleiades/cards/machine/contract.ts"
import { QUANTITIES, SERIES_SLOTS } from "@pleiades/cards/measurement/contract.ts"
import type { Measurement, MeasurementList, MeasurementSeries, Point, Quantity } from "@pleiades/cards/measurement/contract.ts"

import { listTopics, readNewest, readTimelines } from "./apis.ts"
import type { Apis, Newest } from "./apis.ts"
import { HORIZON_SECONDS, machineOf } from "./machines.ts"
import { secondsBefore } from "./time.ts"

// What every machine measures now: the newest value of each physical quantity, in the unit it was
// published in. Nothing is converted and nothing is added up.

/** Where a quantity is published below `machines/{SerialNumber}/`, and whether it is a number or a yes or no. */
export const sources: Record<Quantity, { path: string; kind: "baseUnitValues" | "booleanValues" }> = {
  activePower: { path: "umati/Consumption/Electricity/Main/AcActivePowerTotal", kind: "baseUnitValues" },
  energyImported: { path: "umati/Consumption/Electricity/Main/AcActiveEnergyTotalImportHp", kind: "baseUnitValues" },
  bearingTemperature: { path: "vendor/Spindle/1/BearingTemperature", kind: "baseUnitValues" },
  spindleRotating: { path: "umati/Spindle/1/IsRotating", kind: "booleanValues" },
  feedOverride: { path: "umati/State/FeedOverride", kind: "baseUnitValues" },
  spindleOverride: { path: "umati/Spindle/1/Override", kind: "baseUnitValues" },
  powerOnDuration: { path: "umati/OperationCounters/PowerOnDuration", kind: "baseUnitValues" },
}

export function topicOf(machine: string, quantity: Quantity): string {
  return `machines/${machine}/${sources[quantity].path}`
}

/** One quantity of one machine from its newest value. A value is current for as long as a machine is live. */
export function measurementOf(topic: string, quantity: Quantity, newest: Newest | null, now: Date): Measurement {
  if (newest === null) return { quantity, value: null, unit: null, at: null, stale: true, topic }
  const stale = now.getTime() - Date.parse(newest.at) > SILENT_AFTER_SECONDS * 1000
  return { quantity, value: newest.value, unit: newest.unit, at: newest.at, stale, topic }
}

/** Every machine that published a value in the last 24 hours, with the newest value of each quantity. */
export async function listMeasurements(apis: Apis, now = new Date()): Promise<MeasurementList> {
  const topics = await listTopics(apis, secondsBefore(now, HORIZON_SECONDS), now)
  const serialNumbers = [...new Set(topics.flatMap((topic) => machineOf(topic) ?? []))].sort()
  const machines = await Promise.all(
    serialNumbers.map(async (machine) => ({
      machine,
      measurements: await Promise.all(
        QUANTITIES.map(async (quantity) => {
          const topic = topicOf(machine, quantity)
          return measurementOf(topic, quantity, await readNewest(apis, sources[quantity].kind, topic, now), now)
        }),
      ),
    })),
  )
  return { asOf: now.toISOString(), machines }
}

/** How many minutes the graphs look back, if nobody asks for more or less, and at most. */
export const SERIES_MINUTES = 15
export const MOST_MINUTES = 60

/**
 * A line on the same instants as every other line: the time between `from` and `to` is cut into
 * `slots` slots, and each slot shows the value that held at its end, the newest one measured
 * before it. A value holds until the next one, but not across a silence: older than
 * SILENT_AFTER_SECONDS, nothing is known, and the slot has no value. A value is kept as it was
 * measured, never averaged, so a yes or no stays one. `points` are oldest first.
 */
export function slotted(points: ReadonlyArray<Point>, from: Date, to: Date, slots: number): Array<Point> {
  const width = (to.getTime() - from.getTime()) / slots
  const slotted: Array<Point> = []
  let next = 0
  let held: Point | undefined
  for (let slot = 1; slot <= slots; slot++) {
    const end = from.getTime() + slot * width
    while (next < points.length && Date.parse(points[next]!.at) <= end) held = points[next++]
    const known = held !== undefined && end - Date.parse(held.at) <= SILENT_AFTER_SECONDS * 1000
    slotted.push({ at: new Date(end).toISOString(), value: known ? held!.value : null })
  }
  return slotted
}

/** Every quantity of every machine over the last minutes, a line for each machine. */
export async function listMeasurementSeries(
  apis: Apis,
  minutes = SERIES_MINUTES,
  slots = SERIES_SLOTS,
  now = new Date(),
): Promise<MeasurementSeries> {
  const from = secondsBefore(now, minutes * 60)
  const quantities = await Promise.all(
    QUANTITIES.map(async (quantity) => {
      const { path, kind } = sources[quantity]
      const timelines = await readTimelines(apis, kind, `machines/*/${path}`, from, now)
      const lines = timelines
        .flatMap((timeline) => {
          const machine = machineOf(timeline.topic)
          if (machine === undefined || timeline.topic !== topicOf(machine, quantity)) return []
          return [{ machine, topic: timeline.topic, points: slotted(timeline.samples, from, now, slots) }]
        })
        .sort((a, b) => a.machine.localeCompare(b.machine))
      const unit = timelines.find((timeline) => timeline.unit !== null)?.unit ?? null
      return { quantity, unit, lines }
    }),
  )
  return { from: from.toISOString(), to: now.toISOString(), quantities }
}
