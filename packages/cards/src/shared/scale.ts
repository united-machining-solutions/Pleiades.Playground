// The y axis of a graph of the cards. It spans every value of every line it is given, not only of
// those shown, so the axis stands still when a person turns the pages or changes what is drawn,
// and two views compare. The ticks are round: 1, 2, 2.5 or 5 times a power of ten, in the unit of
// the values, which may be a watt or a hundredth of a degree.

/** The axis: where it begins and ends, in the unit of the values, its ticks and the step between them. */
export type AxisScale = { domain: [number, number]; ticks: Array<number>; step: number }

/** How many steps the axis has about. */
const STEPS = 4

/** A round step near `rough`: 1, 2, 2.5 or 5 times a power of ten. */
function roundStep(rough: number): number {
  const power = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].find((one) => one * power >= rough) ?? 10
  return step * power
}

/**
 * A number without the remainder binary leaves: 0.3 / 0.1 is 2.9999999999999996, and 0.8 + 0.05
 * is 0.8500000000000001. Twelve significant digits keep every value an axis needs.
 */
const exact = (value: number) => Number(value.toPrecision(12))

/**
 * The axis over all values, from a round tick at or below the smallest to one at or above the
 * largest. It never reaches below 0 where no value lies below 0. A line of one value gets a step
 * on either side, a step a tenth of the value, so it lies in the middle whatever its unit. Values
 * that are all 0 give an axis from 0 to `zeroSpan`, a round span in their unit: the energy card
 * asks for a kilowatt. Null where there is no value: the graph then chooses its axis itself.
 */
export function axisScale(values: Iterable<number | null>, { zeroSpan = 1 }: { zeroSpan?: number } = {}): AxisScale | null {
  const numbers = [...values].filter((one): one is number => one !== null && Number.isFinite(one))
  if (numbers.length === 0) return null
  const smallest = Math.min(...numbers)
  const largest = Math.max(...numbers)
  if (smallest === 0 && largest === 0) {
    const step = roundStep(zeroSpan / STEPS)
    return { domain: [0, exact(STEPS * step)], ticks: Array.from({ length: STEPS + 1 }, (_, index) => exact(index * step)), step }
  }
  const span = exact(largest - smallest)
  const step = roundStep(exact(span > 0 ? span / STEPS : Math.abs(largest) / 10))
  let low = Math.floor(exact(smallest / step)) * step
  let high = Math.ceil(exact(largest / step)) * step
  if (exact(low) === exact(high)) {
    low -= step
    high += step
  }
  // An axis does not reach below 0 where no value lies below it.
  if (smallest >= 0 && low < 0) low = 0
  const ticks = Array.from({ length: Math.round((high - low) / step) + 1 }, (_, index) => exact(low + index * step))
  return { domain: [exact(low), exact(high)], ticks, step }
}
