import { written } from "../machine/format.ts"
import type { MachineMeasurements, MeasurementList } from "./contract.ts"
import { measuredValue, quantityLabel } from "./words.ts"

// The measurement card in words, for a reader that does not see it: a language model reads these
// lines as the result of the tool, and a host without cards shows them.

/** What one machine measures now, in a line. A value that is not current says so. */
export function machineMeasurementsInWords({ machine, measurements }: MachineMeasurements): string {
  const values = measurements.map((one) => {
    const said = `${quantityLabel[one.quantity].toLowerCase()} ${measuredValue(one)}`
    if (one.value === null) return said
    return one.stale && one.at ? `${said} (last measured at ${written(one.at)}, not current)` : said
  })
  return `${machine}: ${values.join(", ")}.`
}

/** The list in words: a line for each machine. */
export function measurementListInWords({ asOf, machines }: MeasurementList): string {
  if (machines.length === 0) return "No machine published a value in the last 24 hours."
  return [...machines.map(machineMeasurementsInWords), `Read at ${written(asOf)}.`].join("\n")
}
