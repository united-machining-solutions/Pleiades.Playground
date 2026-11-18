import assert from "node:assert/strict"
import { test } from "node:test"

import { axisScale } from "./scale.ts"

test("the axis spans every line, from a round tick below the smallest to one above the largest", () => {
  // A page of small values and one of large: one axis for both.
  const scale = axisScale([1_900, 5_650, null, null, 3_200, 19_080])
  assert.deepEqual(scale, { domain: [0, 20_000], ticks: [0, 5_000, 10_000, 15_000, 20_000] })
})

test("the axis begins where the values begin, not at zero", () => {
  assert.deepEqual(axisScale([3_800, 5_200]), { domain: [3_500, 5_500], ticks: [3_500, 4_000, 4_500, 5_000, 5_500] })
  assert.deepEqual(axisScale([2_300, 2_900]), { domain: [2_200, 3_000], ticks: [2_200, 2_400, 2_600, 2_800, 3_000] })
})

test("a line of one value gets a step on either side", () => {
  assert.deepEqual(axisScale([4_000, 4_000]), { domain: [3_500, 4_500], ticks: [3_500, 4_000, 4_500] })
})

test("small values get small steps", () => {
  assert.deepEqual(axisScale([0.82, 0.97]), { domain: [0.8, 1], ticks: [0.8, 0.85, 0.9, 0.95, 1] })
})

test("without a value the graph chooses its axis itself", () => {
  assert.equal(axisScale([]), null)
  assert.equal(axisScale([null, null]), null)
})

test("an axis does not reach below 0 where no value is below 0", () => {
  assert.deepEqual(axisScale([0, 300]), { domain: [0, 300], ticks: [0, 100, 200, 300] })
})

test("values that are all 0: from 0 to the span asked for, nothing below", () => {
  // The energy card asks for a kilowatt, as #140 has it for machines that stand still.
  assert.deepEqual(axisScale([0, 0, null, 0], { zeroSpan: 1_000 }), { domain: [0, 1_000], ticks: [0, 250, 500, 750, 1_000] })
})
