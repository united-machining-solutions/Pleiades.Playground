import assert from "node:assert/strict"
import { test } from "node:test"

import { machineListOf, machineShowOf } from "./tool-results.ts"

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

const reading = { value: "Executing", at: "2026-11-16T09:29:55.000Z", since: null, sinceIsLowerBound: false, topic: "t" }
const shown = {
  asOf: "2026-11-16T09:30:00.000Z",
  windowSeconds: 1800,
  machine: {
    machine: "P-04",
    connection: reading,
    heartbeat: reading,
    itemState: reading,
    operationMode: reading,
    program: reading,
    lastValueAt: reading.at,
    notifications: [],
  },
  history: {
    from: "2026-11-16T01:30:00.000Z",
    to: "2026-11-16T09:30:00.000Z",
    spans: [{ state: "running", from: "2026-11-16T01:30:00.000Z", to: "2026-11-16T09:30:00.000Z" }],
  },
}

test("the JSON of genui_machine_show becomes the values of the machine card", () => {
  assert.equal(machineShowOf(JSON.stringify(shown))?.machine.machine, "P-04")
})

test("what does not keep the contract of the card is not drawn as one", () => {
  const unknownState = { ...shown, history: { ...shown.history, spans: [{ ...shown.history.spans[0], state: "idle" }] } }
  assert.equal(machineShowOf(JSON.stringify(unknownState)), null)
  assert.equal(machineShowOf('{"asOf":"2026-11-16T09:30:00.000Z","windowSeconds":1800,"machines":[]}'), null)
  assert.equal(machineShowOf("genui is the generative UI backend"), null)
})
