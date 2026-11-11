import assert from "node:assert/strict"
import { test } from "node:test"

import { currentRun, machineOf } from "./machines.ts"
import { fromMicroseconds } from "./time.ts"

const topic = "machines/P-04/umati/State/MachineryItemState"
const at = (minute: number) => `2026-11-16T09:${String(minute).padStart(2, "0")}:00.000Z`

test("the machine is the topic level after machines/", () => {
  assert.equal(machineOf(topic), "P-04")
  assert.equal(machineOf("machines/M-02/events/notifications"), "M-02")
  assert.equal(machineOf("somewhere/else"), undefined)
})

test("a run starts where the value last changed", () => {
  const run = currentRun(topic, [
    { at: at(0), value: "Executing" },
    { at: at(1), value: "NotExecuting" },
    { at: at(2), value: "Executing" },
    { at: at(3), value: "Executing" },
  ])
  assert.deepEqual(run, {
    value: "Executing",
    at: at(3),
    since: at(2),
    sinceIsLowerBound: false,
    topic,
  })
})

test("a value that never changed in the window has only a lower bound", () => {
  const run = currentRun(topic, [
    { at: at(0), value: "Executing" },
    { at: at(1), value: "Executing" },
  ])
  assert.equal(run.since, at(0))
  assert.equal(run.sinceIsLowerBound, true)
})

test("a topic without a value yields an empty reading that still names its topic", () => {
  assert.deepEqual(currentRun(topic, []), {
    value: null,
    at: null,
    since: null,
    sinceIsLowerBound: false,
    topic,
  })
})

test("microseconds since 1970 become ISO 8601 in UTC", () => {
  assert.equal(fromMicroseconds(1794321213106000), "2026-11-10T14:33:33.106Z")
})
