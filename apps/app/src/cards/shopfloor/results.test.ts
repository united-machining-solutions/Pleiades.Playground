import assert from "node:assert/strict"
import { test } from "node:test"

import { shopfloorShowOf } from "./results.ts"

const values = {
  asOf: "2026-11-16T10:30:00.000+01:00",
  notRunning: 1,
  hall: { name: "Hall 1", width: 40, depth: 24, fixtures: [{ kind: "rack", place: { x: 0.5, y: 2, width: 2, depth: 18 }, label: "Raw material" }], source: "test" },
  machines: [
    {
      machine: "P-04",
      state: "alarm",
      running: false,
      reason: {
        message: "Coolant pressure below minimum",
        detail: "Error 4711",
        since: "2026-11-16T10:20:00.000+01:00",
        atLeast: false,
        topic: "machines/P-04/events/notifications",
      },
      program: "HOUSING_0815.MPF",
      place: { x: 19, y: 4, width: 6, depth: 4.5 },
      topics: ["machines/P-04/umati/State/MachineryItemState"],
    },
  ],
}

test("a result that keeps the contract is the values of the card", () => {
  assert.deepEqual(shopfloorShowOf(JSON.stringify(values)), values)
})

test("a result that does not keep it is not drawn", () => {
  assert.equal(shopfloorShowOf(JSON.stringify({ ...values, notRunning: "one" })), null)
  assert.equal(shopfloorShowOf("not json"), null)
  assert.equal(shopfloorShowOf(undefined), null)
})
