import assert from "node:assert/strict"
import { test } from "node:test"

import { trulaserJobOrderOf, trulaserStatusOf } from "./results.ts"

const signal = { value: "Running", unit: null, at: null, topic: "t" }
const about = { asOf: "2026-11-18T10:00:00.000Z", machine: "trumpf_PLL01_L1649A-STARLINER", serialNumber: "L1649A-STARLINER" }
const jobOrder = {
  ...about,
  jobOrder: null,
  signals: Object.fromEntries(
    ["executionId", "activeWorkMaster", "executionState", "executionStartTime", "executionJobOrderId"].map((name) => [name, signal]),
  ),
}

test("the JSON of genui_trulaser_joborder becomes the values of its card", () => {
  assert.equal(trulaserJobOrderOf(JSON.stringify(jobOrder))?.machine, "trumpf_PLL01_L1649A-STARLINER")
})

test("what does not keep the contract of a TruLaser card is not drawn as one", () => {
  assert.equal(trulaserStatusOf(JSON.stringify(jobOrder)), null)
  assert.equal(trulaserJobOrderOf('{"asOf":"2026-11-18T10:00:00.000Z","machine":"m"}'), null)
  assert.equal(trulaserJobOrderOf("genui is the generative UI backend"), null)
  assert.equal(trulaserJobOrderOf(undefined), null)
})
