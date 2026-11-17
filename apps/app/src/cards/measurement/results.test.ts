import assert from "node:assert/strict"
import { test } from "node:test"

import { measurementListOf } from "./results.ts"

test("the JSON of genui_measurement_list becomes the measurements of every machine", () => {
  const list = measurementListOf(
    JSON.stringify({
      asOf: "2026-11-16T09:30:00.000Z",
      machines: [
        {
          machine: "P-04",
          measurements: [
            { quantity: "activePower", value: 2410.5, unit: "watt", at: "2026-11-16T09:29:58.000Z", stale: false, topic: "t" },
          ],
        },
      ],
    }),
  )
  assert.equal(list?.machines[0]?.measurements[0]?.value, 2410.5)
})

test("what does not keep the contract of the card is not drawn as one", () => {
  assert.equal(measurementListOf('{"asOf":"2026-11-16T09:30:00.000Z","machines":[{"machine":"P-04"}]}'), null)
  assert.equal(measurementListOf("no measurements"), null)
  assert.equal(measurementListOf(undefined), null)
})
