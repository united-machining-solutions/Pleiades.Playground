import assert from "node:assert/strict"
import { test } from "node:test"

import { powerScale } from "./scale.ts"

test("the axis spans every line, from a round tick below the smallest to one above the largest", () => {
  // A page of small values and one of large: one axis for both.
  const scale = powerScale([{ watt: [1_900, 5_650, null] }, { watt: [null, 3_200, 19_080] }])
  assert.deepEqual(scale, { domain: [0, 20_000], ticks: [0, 5_000, 10_000, 15_000, 20_000] })
})

test("the axis begins where the values begin, not at zero", () => {
  assert.deepEqual(powerScale([{ watt: [3_800, 5_200] }]), { domain: [3_500, 5_500], ticks: [3_500, 4_000, 4_500, 5_000, 5_500] })
  assert.deepEqual(powerScale([{ watt: [2_300, 2_900] }]), { domain: [2_200, 3_000], ticks: [2_200, 2_400, 2_600, 2_800, 3_000] })
})

test("a line of one value gets a step on either side", () => {
  assert.deepEqual(powerScale([{ watt: [4_000, 4_000] }]), { domain: [3_500, 4_500], ticks: [3_500, 4_000, 4_500] })
})

test("without a value the graph chooses its axis itself", () => {
  assert.equal(powerScale([]), null)
  assert.equal(powerScale([{ watt: [null, null] }]), null)
})

test("a power of 0 W only: the axis begins at 0 and has room above, never below", () => {
  assert.deepEqual(powerScale([{ watt: [0, 0, null] }, { watt: [0] }]), { domain: [0, 1_000], ticks: [0, 250, 500, 750, 1_000] })
})
