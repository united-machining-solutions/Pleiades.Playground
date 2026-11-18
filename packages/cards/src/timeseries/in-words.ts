import { written } from "../machine/format.ts"
import { measuredValue } from "../measurement/words.ts"
import type { TimeseriesLine, TimeseriesShow } from "./contract.ts"
import { rangeWords, signalLabel } from "./words.ts"

// The time series card in words, for a reader that does not see it: a language model reads these lines
// as the result of the tool, and a host without cards shows them. Each value in the unit it was
// published in.

/** One line of the card in a line of text. */
export function timeseriesLineInWords(line: TimeseriesLine): string {
  const name = `${line.machine}, ${signalLabel(line.path).toLowerCase()} (${line.path})`
  const said: Array<string> = []
  if (line.now === null) said.push("no value ever")
  else {
    const now = `now ${measuredValue({ value: line.now.value, unit: line.unit })}`
    said.push(line.now.stale ? `${now} (last measured at ${written(line.now.at)}, not current)` : now)
  }
  if (line.values === 0) said.push("no value in this range")
  else if (line.low !== null && line.high !== null) {
    said.push(`between ${measuredValue({ value: line.low, unit: line.unit })} and ${measuredValue({ value: line.high, unit: line.unit })}`)
  }
  return `${name}: ${said.join("; ")}.`
}

/** The card in words: the range, then a line for each line. */
export function timeseriesShowInWords({ from, to, range, lines }: TimeseriesShow): string {
  return [`Over ${rangeWords[range]}, ${written(from)} to ${written(to)}:`, ...lines.map(timeseriesLineInWords)].join("\n")
}
