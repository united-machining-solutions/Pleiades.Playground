import assert from "node:assert/strict"
import { test } from "node:test"

import { axisScale } from "./scale.ts"

/** Domain and ticks only, as most tests compare them. */
const axis = (...args: Parameters<typeof axisScale>) => {
  const scale = axisScale(...args)
  return scale && { domain: scale.domain, ticks: scale.ticks }
}

test("the axis spans every line, from a round tick below the smallest to one above the largest", () => {
  // A page of small values and one of large: one axis for both.
  assert.deepEqual(axis([1_900, 5_650, null, null, 3_200, 19_080]), { domain: [0, 20_000], ticks: [0, 5_000, 10_000, 15_000, 20_000] })
})

test("the axis begins where the values begin, not at zero", () => {
  assert.deepEqual(axis([3_800, 5_200]), { domain: [3_500, 5_500], ticks: [3_500, 4_000, 4_500, 5_000, 5_500] })
  assert.deepEqual(axis([2_300, 2_900]), { domain: [2_200, 3_000], ticks: [2_200, 2_400, 2_600, 2_800, 3_000] })
})

test("a line of one value gets a step on either side", () => {
  assert.deepEqual(axis([4_000, 4_000]), { domain: [3_500, 4_500], ticks: [3_500, 4_000, 4_500] })
})

test("a flat line of a small value lies in the middle, whatever its unit", () => {
  // A step of a tenth of the value, not of one unit: 0.012 does not sit on the edge of [0, 1].
  assert.deepEqual(axis([0.012, 0.012]), { domain: [0.01, 0.014], ticks: [0.01, 0.012, 0.014] })
})

test("small values get small steps, without a remainder in the ticks", () => {
  assert.deepEqual(axis([0.82, 0.97]), { domain: [0.8, 1], ticks: [0.8, 0.85, 0.9, 0.95, 1] })
})

test("a value on a tick below one is not taken for the one below it", () => {
  // 0.3 / 0.1 is 2.9999999999999996 and 1.1 / 0.1 is 11.000000000000002 in binary.
  assert.deepEqual(axis([0.3, 0.7]), { domain: [0.3, 0.7], ticks: [0.3, 0.4, 0.5, 0.6, 0.7] })
  assert.deepEqual(axis([0.7, 1.1]), { domain: [0.7, 1.1], ticks: [0.7, 0.8, 0.9, 1, 1.1] })
})

test("the axis says its step, for the decimals of its ticks", () => {
  assert.equal(axisScale([30.02, 30.11])?.step, 0.025)
  assert.equal(axisScale([4_000, 4_002])?.step, 0.5)
})

test("an axis does not reach below 0 where no value is below 0", () => {
  assert.deepEqual(axis([0, 300]), { domain: [0, 300], ticks: [0, 100, 200, 300] })
  assert.deepEqual(axis([-40, 30]), { domain: [-40, 40], ticks: [-40, -20, 0, 20, 40] })
})

test("values that are all 0: from 0 to the span asked for, nothing below", () => {
  // The energy card asks for a kilowatt, as #140 has it for machines that stand still.
  assert.deepEqual(axis([0, 0, null, 0], { zeroSpan: 1_000 }), { domain: [0, 1_000], ticks: [0, 250, 500, 750, 1_000] })
  assert.deepEqual(axis([0]), { domain: [0, 1], ticks: [0, 0.25, 0.5, 0.75, 1] })
})

test("without a value the graph chooses its axis itself", () => {
  assert.equal(axisScale([]), null)
  assert.equal(axisScale([null, null]), null)
})
