import assert from "node:assert/strict"
import { test } from "node:test"

import { machineListOf } from "./tool-results.ts"

test("the JSON of genui_machine_list becomes the list of machines", () => {
  const list = machineListOf('{"asOf":"2026-11-16T09:30:00.000Z","windowSeconds":1800,"machines":[]}')
  assert.equal(list?.asOf, "2026-11-16T09:30:00.000Z")
  assert.deepEqual(list?.machines, [])
})

test("any other text is no list", () => {
  assert.equal(machineListOf("genui is the generative UI backend"), null)
  assert.equal(machineListOf('{"machines":"three"}'), null)
  assert.equal(machineListOf(undefined), null)
})
