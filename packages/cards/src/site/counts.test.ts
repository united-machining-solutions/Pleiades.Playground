import assert from "node:assert/strict"
import { test } from "node:test"

import { countsOf } from "./counts.ts"

test("the counts stand in the order a display reads the states, without a state no machine is in", () => {
  assert.deepEqual(countsOf(["no-data", "running", "alarm", "running"]), [
    { state: "running", machines: 2 },
    { state: "alarm", machines: 1 },
    { state: "no-data", machines: 1 },
  ])
  assert.deepEqual(countsOf([]), [])
})
