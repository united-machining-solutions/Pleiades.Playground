import type { MachineMeasurements, MeasurementSeries, Quantity } from "@pleiades/cards/measurement/contract.ts"

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
 * the page always had it. With all machines, at most one: where a single machine measures the quantity
 * now, its value stands there, and where more do, the lines speak alone. Where none measures it now and a
 * single machine has an older value, that one stands there, marked as not current.
 *
 * The backend lists every quantity for every machine, with the value null where the machine never
 * published it, and keeps the last value of a machine that went silent as `stale`: a machine counts only
 * where its value is one.
 */
export function nowNextToTitle(
  current: ReadonlyArray<MachineMeasurements>,
  shown: ReadonlyArray<string>,
  quantity: Quantity,
  chosen: string | undefined,
): Array<MachineMeasurements> {
  const ofShown = current.filter((measured) => shown.includes(measured.machine))
  if (chosen !== undefined) return ofShown
  const having = (live: boolean) =>
    ofShown.filter((measured) =>
      measured.measurements.some((one) => one.quantity === quantity && one.value !== null && (!live || !one.stale)),
    )
  const now = having(true)
  if (now.length > 0) return now.length === 1 ? now : []
  const ever = having(false)
  return ever.length === 1 ? ever : []
}
