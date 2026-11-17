import assert from "node:assert/strict"
import { test } from "node:test"

import { viewShowOf } from "./results.ts"

const values = {
  title: "Faults today",
  asOf: "2026-11-17T16:20:00.000+01:00",
  blocks: [
    {
      type: "kpi",
      label: "Errors",
      measure: "errors",
      machine: null,
      value: 58,
      unit: "count",
      from: "2026-11-16T16:20:00.000+01:00",
      to: "2026-11-17T16:20:00.000+01:00",
      source: "Events API",
    },
    { type: "note", text: "P-04 needs a look at its coolant.", tone: "info" },
    { type: "gaps", title: "Costs", have: ["Run time"], missing: [{ what: "Hourly rate", source: "ERP" }] },
  ],
}

test("a result that keeps the contract is the values of the view", () => {
  assert.deepEqual(viewShowOf(JSON.stringify(values)), values)
})

test("a block the contract does not know is not drawn", () => {
  assert.equal(viewShowOf(JSON.stringify({ ...values, blocks: [{ type: "video", url: "x" }] })), null)
  assert.equal(viewShowOf("not json"), null)
})
