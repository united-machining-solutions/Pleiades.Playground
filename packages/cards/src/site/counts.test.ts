import assert from "node:assert/strict"
import { test } from "node:test"

import { countsOf, needsYouOf, sendingOf } from "./counts.ts"

test("the counts stand in the order a display reads the states, without a state no machine is in", () => {
  assert.deepEqual(countsOf(["no-data", "running", "alarm", "running"]), [
    { state: "running", machines: 2 },
    { state: "alarm", machines: 1 },
    { state: "no-data", machines: 1 },
  ])
  assert.deepEqual(countsOf([]), [])
})

test("a machine sends unless it has no data, and needs someone in alarm, stopped or without data", () => {
  const states = ["running", "setup", "stopped", "alarm", "no-data", "running"] as const
  assert.equal(sendingOf(states), 5)
  assert.equal(needsYouOf(states), 3)
  assert.equal(sendingOf([]), 0)
  assert.equal(needsYouOf([]), 0)
})
