// The y axis of a graph of the cards. It spans every value of every line it is given, not only of
// those shown, so the axis stands still when a person turns the pages or changes what is drawn,
// and two views compare. The ticks are round: 1, 2, 2.5 or 5 times a power of ten.

/** The axis: where it begins and ends, in the unit of the values, and its ticks. */
export type AxisScale = { domain: [number, number]; ticks: Array<number> }

/** How many steps the axis has about. */
const STEPS = 4

/** A round step near `rough`: 1, 2, 2.5 or 5 times a power of ten. */
function roundStep(rough: number): number {
  const power = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].find((one) => one * power >= rough) ?? 10
  return step * power
}

/**
 * The axis over all values, from a round tick at or below the smallest to one at or above the
 * largest. A single value gets a step on either side. Null where there is no value: the graph then
 * chooses its axis itself.
 */
export function axisScale(values: Iterable<number | null>, { zeroSpan = 1 }: { zeroSpan?: number } = {}): AxisScale | null {
  const numbers = [...values].filter((one): one is number => one !== null && Number.isFinite(one))
  if (numbers.length === 0) return null
  const smallest = Math.min(...numbers)
  const largest = Math.max(...numbers)
  const span = largest - smallest
  const step = roundStep(span > 0 ? span / STEPS : Math.max(Math.abs(largest) / 10, 1))
  let low = Math.floor(smallest / step) * step
  let high = Math.ceil(largest / step) * step
  if (smallest === 0 && largest === 0) {
    // Values that are all 0: from 0 to the span asked for, nothing below.
    const span0 = roundStep(zeroSpan / STEPS)
    return { domain: [0, STEPS * span0], ticks: Array.from({ length: STEPS + 1 }, (_, index) => index * span0) }
  }
  if (low === high) {
    low -= step
    high += step
  }
  // An axis does not reach below 0 where no value lies below it.
  if (smallest >= 0 && low < 0) low = 0
  // A step below one leaves a remainder in binary: 0.8 + 0.05 is 0.8500000000000001. Round it away.
  const digits = Math.max(0, 2 - Math.floor(Math.log10(step)))
  const round = (value: number) => Number(value.toFixed(digits))
  const ticks = Array.from({ length: Math.round((high - low) / step) + 1 }, (_, index) => round(low + index * step))
  return { domain: [round(low), round(high)], ticks }
}
