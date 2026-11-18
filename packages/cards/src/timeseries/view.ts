import { MOST_LINES, MOST_UNITS } from "./contract.ts"

// What a person changes on the time series card, and what stays put while they do: the colour of each
// line and the axis of each unit. The values come from the backend; this only places them.

/** The units on the two y axes; null where an axis has none. */
export type Axes = { left: string | null; right: string | null }

export const NO_AXES: Axes = { left: null, right: null }

/**
 * The axes for the units of the lines drawn now. A unit that was on an axis stays there, so the same
 * unit is always on the same side while a person adds and removes lines; a new unit takes the
 * left axis if it is free, else the right. Null if the units are more than there are axes.
 */
export function axesFor(previous: Axes, units: ReadonlyArray<string>): Axes | null {
  const wanted = [...new Set(units)]
  if (wanted.length > MOST_UNITS) return null
  const left = previous.left !== null && wanted.includes(previous.left) ? previous.left : null
  const right = previous.right !== null && wanted.includes(previous.right) ? previous.right : null
  const placed: Axes = { left, right }
  for (const unit of wanted) {
    if (unit === placed.left || unit === placed.right) continue
    if (placed.left === null) placed.left = unit
    else placed.right = unit
  }
  return placed
}

/**
 * The colour of a new line: the first of `--chart-1` to `--chart-8` that no line has. A line keeps
 * its colour while others come and go. Null if every colour is taken: then the card is full.
 */
export function nextColour(taken: ReadonlyArray<number>): number | null {
  for (let colour = 1; colour <= MOST_LINES; colour++) if (!taken.includes(colour)) return colour
  return null
}

/**
 * Whether a signal of a machine matches what a person typed: every word of it, in any order and
 * any case, somewhere in the machine id, the name of the signal or its path. "P-04 power" finds the
 * active power of alcyone-machines_AX-400_P-04.
 */
export function matchesSearch(said: ReadonlyArray<string>, query: string): boolean {
  const text = said.join(" ").toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word))
}

/**
 * The newest value of a line in the range, and whether it is current: it is not where the line has
 * no value at its last instant, because the machine fell silent after it, as the words of the result
 * say "not current". Null where the line has no value at all.
 */
export function lastValue(values: ReadonlyArray<number | boolean | null>): { value: number | boolean; current: boolean } | null {
  for (let index = values.length - 1; index >= 0; index--) {
    const value = values[index]
    if (value !== null && value !== undefined) return { value, current: index === values.length - 1 }
  }
  return null
}
