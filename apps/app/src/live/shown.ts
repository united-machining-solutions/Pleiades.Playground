import type { MachineMeasurements, MeasurementSeries } from "@pleiades/cards/measurement/contract.ts"

// What the page Live values shows of what it has: which graphs, and which value of now next to the
// title of a graph. With all machines the page would otherwise be full of graphs no machine fills and of
// rows of values next to each title.

type Graph = MeasurementSeries["quantities"][number]

/**
 * The graphs the page shows. With all machines, only those with a line: a value no machine published is
 * left out. With one machine chosen, every graph, so the page says which values that machine has not.
 */
export function graphsOf(quantities: ReadonlyArray<Graph>, chosen: string | undefined): Array<Graph> {
  return quantities.filter((one) => chosen !== undefined || one.lines.length > 0)
}

/**
 * The values of now that stand next to the title of a graph. With one machine chosen, that machine's, as
 * the page always had it. With all machines, at most one: where a single machine has a value of the
 * quantity it stands there, and where more have one, the lines speak alone.
 *
 * The backend lists every quantity for every machine, with the value null where the machine never
 * published it: a machine counts only where its value is one.
 */
export function nowNextToTitle(
  current: ReadonlyArray<MachineMeasurements>,
  shown: ReadonlyArray<string>,
  quantity: string,
  chosen: string | undefined,
): Array<MachineMeasurements> {
  const ofShown = current.filter((measured) => shown.includes(measured.machine))
  if (chosen !== undefined) return ofShown
  const measuring = ofShown.filter((measured) =>
    measured.measurements.some((measurement) => measurement.quantity === quantity && measurement.value !== null),
  )
  return measuring.length === 1 ? measuring : []
}
