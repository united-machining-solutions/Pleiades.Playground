import { HORIZON_SECONDS, READING_PATHS, SILENT_AFTER_SECONDS } from "@pleiades/cards/machine/contract.ts"
import { QUANTITIES, QUANTITY_PATHS } from "@pleiades/cards/measurement/contract.ts"
import type { MachineMeasurements, MeasurementList, MeasurementSeries, Quantity } from "@pleiades/cards/measurement/contract.ts"

import { brokerPathsOf, filterOf, machineOf, valuesOf } from "./messages.ts"

// What every machine measures, kept up to date from the broker. The backend gives the graphs of the
// last minutes and the values of then; every value the broker sends after that is laid onto them
// here, by the rules the backend reads the stored values with (apps/genui-mcp/src/measurements.ts).

type Point = { at: string; value: number | boolean }

/** The page of the live values. */
export type LivePage = {
  series: MeasurementSeries | null
  current: MeasurementList | null
  /** The newest sign of life of each machine: any value it published. */
  lastSign: Readonly<Record<string, string>>
  /** For each line, by its topic, the values that came after the last instant of the graphs, oldest first. */
  pending: Readonly<Record<string, ReadonlyArray<Point>>>
  /** For each line, by its topic, the value that held at the last instant of the graphs. */
  held: Readonly<Record<string, number | boolean | null>>
}

/** The readings of what a machine does, where the broker carries them: a snapshot is one topic. */
const readingPaths = [...new Set(Object.values(READING_PATHS).flatMap(brokerPathsOf))]

/**
 * The topics a page subscribes to: every quantity, and the readings of what a machine does,
 * which are signs of life too. Of every machine, or of the one named.
 */
export function measurementFilters(machine?: string): Array<string> {
  return [
    ...QUANTITIES.map((quantity) => filterOf(QUANTITY_PATHS[quantity], machine)),
    ...readingPaths.map((path) => filterOf(path, machine)),
  ]
}

function later(a: string | undefined, b: string | undefined): string | undefined {
  return a === undefined || (b !== undefined && b > a) ? b : a
}

/** The page as the backend gave it. A machine that measured at the end of the graphs, or now, was there then. */
export function livePageOf(series: MeasurementSeries | null, current: MeasurementList | null): LivePage {
  const lastSign: Record<string, string> = {}
  const held: Record<string, number | boolean | null> = {}
  for (const quantity of series?.quantities ?? []) {
    for (const line of quantity.lines) {
      const last = line.values.at(-1) ?? null
      held[line.topic] = last
      if (last !== null && series) lastSign[line.machine] = later(lastSign[line.machine], series.to) ?? series.to
    }
  }
  for (const machine of current?.machines ?? []) {
    for (const measurement of machine.measurements) {
      if (!measurement.stale && measurement.at !== null) {
        lastSign[machine.machine] = later(lastSign[machine.machine], measurement.at) ?? measurement.at
      }
    }
  }
  return { series, current, lastSign, pending: {}, held }
}

/** A machine the page has not heard of yet: nothing is known about what it measures. */
function unknownMachine(machine: string): MachineMeasurements {
  return {
    machine,
    measurements: QUANTITIES.map((quantity) => ({
      quantity,
      value: null,
      unit: null,
      at: null,
      stale: true,
      topic: filterOf(QUANTITY_PATHS[quantity], machine),
    })),
  }
}

/** The values of now with a new value of one quantity of one machine. */
function currentWith(current: MeasurementList, machine: string, quantity: Quantity, point: Point, unit: string | null): MeasurementList {
  const machines = current.machines.some((one) => one.machine === machine)
    ? current.machines
    : [...current.machines, unknownMachine(machine)].sort((a, b) => a.machine.localeCompare(b.machine))
  return {
    ...current,
    machines: machines.map((one) =>
      one.machine !== machine
        ? one
        : {
            ...one,
            measurements: one.measurements.map((measurement) =>
              measurement.quantity !== quantity || (measurement.at !== null && point.at <= measurement.at)
                ? measurement
                : { ...measurement, value: point.value, unit: typeof point.value === "number" ? unit : null, at: point.at, stale: false },
            ),
          },
    ),
  }
}

/** The graphs with a line for the topic, if there is none yet: without values before. */
function seriesWithLine(series: MeasurementSeries, machine: string, quantity: Quantity, topic: string, unit: string | null): MeasurementSeries {
  return {
    ...series,
    quantities: series.quantities.map((one) => {
      if (one.quantity !== quantity) return one
      const hasLine = one.lines.some((line) => line.topic === topic)
      return {
        ...one,
        unit: one.unit ?? unit,
        lines: hasLine ? one.lines : [...one.lines, { machine, topic, values: series.instants.map(() => null) }],
      }
    }),
  }
}

/**
 * What a message of the broker does to the page. `now`, in milliseconds since 1970, is the clock of
 * the server: a value stamped far ahead of it is left out.
 */
export function liveWith(page: LivePage, topic: string, payload: string, now = Date.now()): LivePage {
  const machine = machineOf(topic)
  // A snapshot is several values of one instant; a quantity is one value on its topic.
  const value = machine && valuesOf(topic, payload, now)[0]?.value
  if (!machine || !value) return page
  // At the broker the retained values of a machine that is long gone still stand. The backend lists a
  // machine that published in the last 24 hours; a page that has not heard of one keeps to the same.
  const heardOf = page.lastSign[machine] !== undefined || (page.current?.machines.some((one) => one.machine === machine) ?? false)
  if (!heardOf && now - Date.parse(value.at) > HORIZON_SECONDS * 1000) return page
  // Every value is a sign of life, whatever it says.
  const lastSign = { ...page.lastSign, [machine]: later(page.lastSign[machine], value.at) ?? value.at }
  const quantity = QUANTITIES.find((one) => topic === filterOf(QUANTITY_PATHS[one], machine))
  if (quantity === undefined || typeof value.value === "string") return { ...page, lastSign }
  const point = { at: value.at, value: value.value }
  const unit = typeof value.value === "number" ? value.unit : null

  const current = page.current && currentWith(page.current, machine, quantity, point, unit)
  // A value after the last instant waits for the instant at which it holds. One from before is in the graphs already.
  const series = page.series && seriesWithLine(page.series, machine, quantity, topic, unit)
  const pending =
    series && point.at > series.to
      ? { ...page.pending, [topic]: [...(page.pending[topic] ?? []), point].sort((a, b) => a.at.localeCompare(b.at)) }
      : page.pending
  return { ...page, series, current, lastSign, pending }
}

function silentAt(lastSign: string | undefined, at: number): boolean {
  return lastSign === undefined || at - Date.parse(lastSign) > SILENT_AFTER_SECONDS * 1000
}

/**
 * The page at a later instant. A machine silent for longer than SILENT_AFTER_SECONDS measures
 * nothing that is current, until its next value. The graphs move on by whole slots: at the end
 * of each one, a line holds its newest value, but not across a silence of its machine.
 */
export function liveAt(page: LivePage, now: string): LivePage {
  const time = Date.parse(now)
  const current = page.current && {
    ...page.current,
    asOf: now > page.current.asOf ? now : page.current.asOf,
    machines: page.current.machines.map((one) =>
      silentAt(page.lastSign[one.machine], time) && one.measurements.some((measurement) => !measurement.stale)
        ? { ...one, measurements: one.measurements.map((measurement) => ({ ...measurement, stale: true })) }
        : one,
    ),
  }

  const { series } = page
  if (series === null || series.instants.length === 0) return { ...page, current }
  const slot = (Date.parse(series.to) - Date.parse(series.from)) / series.instants.length
  const slots = Math.floor((time - Date.parse(series.to)) / slot)
  if (!(slots > 0)) return { ...page, current }

  const pending: Record<string, ReadonlyArray<Point>> = { ...page.pending }
  const held: Record<string, number | boolean | null> = { ...page.held }
  // After a long pause, a tab in the background for example, only the slots the graphs still show are worked out.
  const shown = Math.min(slots, series.instants.length)
  const ends = Array.from({ length: shown }, (_, index) => Date.parse(series.to) + (slots - shown + index + 1) * slot)
  const quantities = series.quantities.map((quantity) => ({
    ...quantity,
    lines: quantity.lines.map((line) => {
      const added = ends.map((end) => {
        const waiting = pending[line.topic] ?? []
        const arrived = waiting.filter((point) => Date.parse(point.at) <= end)
        if (arrived.length > 0) {
          held[line.topic] = arrived.at(-1)!.value
          pending[line.topic] = waiting.slice(arrived.length)
        }
        if (silentAt(page.lastSign[line.machine], end)) held[line.topic] = null
        return held[line.topic] ?? null
      })
      return { ...line, values: [...line.values, ...added].slice(-series.instants.length) }
    }),
  }))
  const instants = [...series.instants, ...ends.map((end) => new Date(end).toISOString())].slice(-series.instants.length)
  return {
    ...page,
    current,
    pending,
    held,
    series: {
      ...series,
      from: new Date(Date.parse(series.from) + slots * slot).toISOString(),
      to: new Date(ends.at(-1)!).toISOString(),
      instants,
      quantities,
    },
  }
}
