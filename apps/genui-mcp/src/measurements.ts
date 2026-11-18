import { SILENT_AFTER_SECONDS } from "@pleiades/cards/machine/contract.ts"
import { QUANTITIES, QUANTITY_PATHS, SERIES_SLOTS } from "@pleiades/cards/measurement/contract.ts"
import type { LineValue, Measurement, MeasurementList, MeasurementSeries, Quantity } from "@pleiades/cards/measurement/contract.ts"

import { listTopics, readNewest, readTimelines } from "./apis.ts"
import type { Apis, Newest } from "./apis.ts"
import { silences, silentBetween } from "./liveness.ts"
import type { Stretch } from "./liveness.ts"
import { HORIZON_SECONDS, WINDOW_SECONDS, machineOf, readSignsOfLife } from "./machines.ts"
import { secondsBefore } from "./time.ts"

// What every machine measures now: the newest value of each physical quantity, in the unit it was
// published in. Nothing is converted and nothing is added up.

/** Where a quantity is published below `machines/{machineId}/`, and whether it is a number or a yes or no. */
export const sources: Record<Quantity, { path: string; kind: "baseUnitValues" | "booleanValues" }> = {
  activePower: { path: QUANTITY_PATHS.activePower, kind: "baseUnitValues" },
  energyImported: { path: QUANTITY_PATHS.energyImported, kind: "baseUnitValues" },
  bearingTemperature: { path: QUANTITY_PATHS.bearingTemperature, kind: "baseUnitValues" },
  spindleRotating: { path: QUANTITY_PATHS.spindleRotating, kind: "booleanValues" },
  feedOverride: { path: QUANTITY_PATHS.feedOverride, kind: "baseUnitValues" },
  spindleOverride: { path: QUANTITY_PATHS.spindleOverride, kind: "baseUnitValues" },
  powerOnDuration: { path: QUANTITY_PATHS.powerOnDuration, kind: "baseUnitValues" },
}

export function topicOf(machine: string, quantity: Quantity): string {
  return `machines/${machine}/${sources[quantity].path}`
}

/**
 * One quantity of one machine from its newest value. A value holds until the next one of its
 * topic, however long that takes, as long as the machine is there: it is current unless the
 * machine was silent at some time since (`silent`, see liveness.ts).
 */
export function measurementOf(
  topic: string,
  quantity: Quantity,
  newest: Newest | null,
  silent: ReadonlyArray<Stretch>,
  now: Date,
): Measurement {
  if (newest === null) return { quantity, value: null, unit: null, at: null, stale: true, topic }
  const stale = silentBetween(silent, newest.at, now.toISOString())
  return { quantity, value: newest.value, unit: newest.unit, at: newest.at, stale, topic }
}

/**
 * Every machine that published a value in the last 24 hours, with the newest value of each
 * quantity; with `machine`, that one only. Whether a value is current is read from the signs of
 * life of the last WINDOW_SECONDS, as the list of machines reads it.
 */
export async function listMeasurements(apis: Apis, now = new Date(), machine?: string): Promise<MeasurementList> {
  const windowStart = secondsBefore(now, WINDOW_SECONDS)
  const [topics, signs] = await Promise.all([
    listTopics(apis, secondsBefore(now, HORIZON_SECONDS), now),
    readSignsOfLife(apis, secondsBefore(windowStart, SILENT_AFTER_SECONDS), now),
  ])
  const known = [...new Set(topics.flatMap((topic) => machineOf(topic) ?? []))].sort()
  if (machine !== undefined && !known.includes(machine)) {
    throw new Error(`No machine "${machine}" published a value in the last 24 hours. Machines that did: ${known.join(", ") || "none"}.`)
  }
  const machineIds = machine === undefined ? known : [machine]
  const machines = await Promise.all(
    machineIds.map(async (machineId) => {
      const newest = await Promise.all(
        QUANTITIES.map((quantity) => readNewest(apis, sources[quantity].kind, topicOf(machineId, quantity), now)),
      )
      // Every value is a sign of life, the newest of each quantity too.
      const lifeSigns = [...(signs.get(machineId) ?? []), ...newest.flatMap((one) => (one ? [one.at] : []))]
      const silent = silences(lifeSigns, windowStart.toISOString(), now.toISOString())
      return {
        machine: machineId,
        measurements: QUANTITIES.map((quantity, index) =>
          measurementOf(topicOf(machineId, quantity), quantity, newest[index] ?? null, silent, now),
        ),
      }
    }),
  )
  return { asOf: now.toISOString(), machines }
}

/** How many minutes the graphs look back, if nobody asks for more or less, and at most. */
export const SERIES_MINUTES = 15
export const MOST_MINUTES = 60

/** A value as it was measured. */
type Measured = { at: string; value: number | boolean }

/** The instants of every line: the time between `from` and `to` cut into `slots` slots, the end of each. */
export function slotEnds(from: Date, to: Date, slots: number): Array<string> {
  const width = (to.getTime() - from.getTime()) / slots
  return Array.from({ length: slots }, (_, slot) => new Date(from.getTime() + (slot + 1) * width).toISOString())
}

/**
 * A line on the same instants as every other line: at each of `instants` the value that held, the
 * newest one measured before it. A value holds until the next one, but not across a silence of
 * the machine (`silent`, see liveness.ts): what it was then is not known, and the line has no
 * value until the next one. A value is kept as it was measured, never averaged, so a yes or no
 * stays one.
 */
export function slotted(
  measured: ReadonlyArray<Measured>,
  instants: ReadonlyArray<string>,
  silent: ReadonlyArray<Stretch>,
): Array<LineValue> {
  const sorted = [...measured].sort((a, b) => a.at.localeCompare(b.at))
  let next = 0
  let held: Measured | undefined
  return instants.map((end) => {
    while (next < sorted.length && sorted[next]!.at <= end) held = sorted[next++]
    return held !== undefined && !silentBetween(silent, held.at, end) ? held.value : null
  })
}

/**
 * Every quantity of every machine over the last minutes, a line for each machine that has a
 * value of it. A line begins with the value that held where the minutes begin, however old, so a
 * value that is published only when it changes is drawn too.
 */
export async function listMeasurementSeries(
  apis: Apis,
  minutes = SERIES_MINUTES,
  slots = SERIES_SLOTS,
  now = new Date(),
): Promise<MeasurementSeries> {
  const from = secondsBefore(now, minutes * 60)
  // The signs of life just before say whether the machine was there where the lines begin.
  const [signs, ...timelines] = await Promise.all([
    readSignsOfLife(apis, secondsBefore(from, SILENT_AFTER_SECONDS), now),
    ...QUANTITIES.map((quantity) => readTimelines(apis, sources[quantity].kind, `machines/*/${sources[quantity].path}`, from, now)),
  ])
  const samplesOf = (quantity: Quantity, machine: string) =>
    timelines[QUANTITIES.indexOf(quantity)]?.find((one) => one.topic === topicOf(machine, quantity))?.samples ?? []
  const machineIds = [
    ...new Set([...signs.keys(), ...timelines.flat().flatMap((one) => machineOf(one.topic) ?? [])]),
  ].sort()

  // The value that held where the lines begin, for each machine and quantity.
  const held = await Promise.all(
    machineIds.map((machine) =>
      Promise.all(QUANTITIES.map((quantity) => readNewest(apis, sources[quantity].kind, topicOf(machine, quantity), from))),
    ),
  )
  // Every value is a sign of life.
  const silent = new Map(
    machineIds.map((machine) => {
      const values = QUANTITIES.flatMap((quantity) => samplesOf(quantity, machine).map((sample) => sample.at))
      return [machine, silences([...(signs.get(machine) ?? []), ...values], from.toISOString(), now.toISOString())]
    }),
  )

  const instants = slotEnds(from, now, slots)
  const quantities = QUANTITIES.map((quantity, index) => {
    const lines = machineIds.flatMap((machine, row) => {
      const before = held[row]?.[index]
      const measured = [...(before ? [{ at: before.at, value: before.value }] : []), ...samplesOf(quantity, machine)]
      if (measured.length === 0) return []
      const topic = topicOf(machine, quantity)
      return [{ machine, topic, values: slotted(measured, instants, silent.get(machine) ?? []) }]
    })
    const unit =
      timelines[index]?.find((one) => one.unit !== null)?.unit ??
      held.map((row) => row[index]).find((one) => one?.unit != null)?.unit ??
      null
    return { quantity, unit, lines }
  })
  return { from: from.toISOString(), to: now.toISOString(), instants, quantities }
}
