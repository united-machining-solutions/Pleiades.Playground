// The y axis of the graph of the energy card. It spans the power of every machine of the result,
// not only of those on the page, so the axis stands still when a person turns the pages and two
// pages compare. The ticks are round: 1, 2, 2.5 or 5 times a power of ten, in watt.

/** The axis: where it begins and ends, in watt, and its ticks. */
export type PowerScale = { domain: [number, number]; ticks: Array<number> }

/** How many steps the axis has about. */
const STEPS = 4

/** A round step near `rough`: 1, 2, 2.5 or 5 times a power of ten. */
function roundStep(rough: number): number {
  const power = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].find((one) => one * power >= rough) ?? 10
  return step * power
}

/**
 * The axis over all values of all lines, from a round tick at or below the smallest to one at or
 * above the largest. A line of one value gets a step on either side. Null where there is no value:
 * the graph then chooses its axis itself.
 */
export function powerScale(lines: ReadonlyArray<{ watt: ReadonlyArray<number | null> }>): PowerScale | null {
  const values = lines.flatMap((line) => line.watt.filter((one): one is number => one !== null && Number.isFinite(one)))
  if (values.length === 0) return null
  const smallest = Math.min(...values)
  const largest = Math.max(...values)
  const span = largest - smallest
  const step = roundStep(span > 0 ? span / STEPS : Math.max(Math.abs(largest) / 10, 1))
  let low = Math.floor(smallest / step) * step
  let high = Math.ceil(largest / step) * step
  if (low === high) {
    low -= step
    high += step
  }
  const ticks = Array.from({ length: Math.round((high - low) / step) + 1 }, (_, index) => low + index * step)
  return { domain: [low, high], ticks }
}
