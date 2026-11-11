import assert from "node:assert/strict"
import { test } from "node:test"

import { silences } from "./liveness.ts"
import { currentRun, machineOf } from "./machines.ts"
import { fromMicroseconds } from "./time.ts"

const topic = "machines/P-04/umati/State/MachineryItemState"
const windowStart = "2026-11-16T09:00:00.000Z"
/** An instant that many seconds after the start of the window. */
const at = (seconds: number) => new Date(Date.parse(windowStart) + seconds * 1000).toISOString()
/** A value every five seconds, as a simulator publishes it. */
const every5s = (from: number, to: number, value: string) =>
  Array.from({ length: (to - from) / 5 + 1 }, (_, index) => ({ at: at(from + index * 5), value }))
/** The machine was there the whole time. */
const neverSilent = [] as const

test("the machine is the topic level after machines/", () => {
  assert.equal(machineOf(topic), "P-04")
  assert.equal(machineOf("machines/M-02/events/notifications"), "M-02")
  assert.equal(machineOf("somewhere/else"), undefined)
})

test("a run starts where the value last changed", () => {
  const samples = [
    ...every5s(0, 55, "Executing"),
    ...every5s(60, 115, "NotExecuting"),
    ...every5s(120, 180, "Executing"),
  ]
  assert.deepEqual(currentRun(topic, samples, neverSilent, true), {
    value: "Executing",
    at: at(180),
    since: at(120),
    sinceIsLowerBound: false,
    topic,
  })
})

test("a value that never changed in what was read has only a lower bound", () => {
  const run = currentRun(topic, every5s(-5, 180, "Executing"), neverSilent, true)
  assert.equal(run.since, at(-5))
  assert.equal(run.sinceIsLowerBound, true)
})

test("a value that is the first one there is has a since", () => {
  const run = currentRun(topic, every5s(1200, 1260, "Executing"), neverSilent, false)
  assert.equal(run.since, at(1200))
  assert.equal(run.sinceIsLowerBound, false)
})

test("a value published once holds, however long ago, and its change is its since", () => {
  const samples = [
    { at: at(-7200), value: "NotExecuting" },
    { at: at(-3600), value: "Executing" },
  ]
  assert.deepEqual(currentRun(topic, samples, neverSilent, true), {
    value: "Executing",
    at: at(-3600),
    since: at(-3600),
    sinceIsLowerBound: false,
    topic,
  })
})

test("a value that is announced again is the same run, while the machine is there", () => {
  const samples = [
    { at: at(-3600), value: "Executing" },
    { at: at(600), value: "Executing" },
  ]
  assert.equal(currentRun(topic, samples, neverSilent, false).since, at(-3600))
  assert.equal(currentRun(topic, samples, neverSilent, true).sinceIsLowerBound, true)
})

test("a silence of the machine ends a run, also if the value is the same after it", () => {
  const samples = [...every5s(0, 60, "Executing"), ...every5s(600, 660, "Executing")]
  const silent = silences(
    samples.map((sample) => sample.at),
    at(0),
    at(660),
  )
  const run = currentRun(topic, samples, silent, true)
  assert.equal(run.since, at(600))
  assert.equal(run.sinceIsLowerBound, false)
})

test("a machine that came back in the window has the first value after its silence as since", () => {
  // Its last value from before, hours ago, and what it publishes since it is back.
  const samples = [{ at: at(-7200), value: "Executing" }, ...every5s(1200, 1260, "Executing")]
  const silent = silences(
    every5s(1200, 1260, "Executing").map((sample) => sample.at),
    at(0),
    at(1260),
  )
  const run = currentRun(topic, samples, silent, true)
  assert.equal(run.since, at(1200))
  assert.equal(run.sinceIsLowerBound, false)
})

test("a topic without a value yields an empty reading that still names its topic", () => {
  assert.deepEqual(currentRun(topic, [], neverSilent, false), {
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
