import assert from "node:assert/strict"
import { test } from "node:test"

import type { Sample } from "./apis.ts"
import { spansBetween, thinned, totalsOf } from "./history.ts"

const start = "2026-11-16T09:00:00.000Z"
/** An instant that many seconds after the start. */
const at = (seconds: number) => new Date(Date.parse(start) + seconds * 1000).toISOString()
/** A value every five seconds, as a machine publishes it. */
const every5s = (from: number, to: number, value: string): Array<Sample> =>
  Array.from({ length: (to - from) / 5 + 1 }, (_, index) => ({ at: at(from + index * 5), value }))

/** A machine that is connected and in production the whole time, with this item state. */
const producing = (itemState: Array<Sample>, to: number) => ({
  connection: every5s(-5, to, "Connected"),
  operationMode: every5s(-5, to, "Processing"),
  itemState,
  heartbeat: [],
  errors: [],
})

/**
 * A machine that told its state once, an hour before, and has given only its heartbeat since.
 * The heartbeat counts up, every five seconds.
 */
const toldOnce = (heartbeatTo: number) => ({
  connection: [{ at: at(-3600), value: "Connected" }],
  operationMode: [{ at: at(-3600), value: "Processing" }],
  itemState: [{ at: at(-3600), value: "Executing" }],
  heartbeat: every5s(-5, heartbeatTo, "beat").map((sample, index) => ({ ...sample, value: String(index) })),
  errors: [],
})

test("a machine that runs the whole time is one span", () => {
  const spans = spansBetween(at(0), at(600), producing(every5s(-5, 600, "Executing"), 600))
  assert.deepEqual(spans, [{ state: "running", from: at(0), to: at(600) }])
})

test("a span ends where the value changes", () => {
  const itemState = [
    ...every5s(-5, 115, "Executing"),
    ...every5s(120, 175, "NotExecuting"),
    ...every5s(180, 300, "Executing"),
  ]
  assert.deepEqual(spansBetween(at(0), at(300), producing(itemState, 300)), [
    { state: "running", from: at(0), to: at(120) },
    { state: "stopped", from: at(120), to: at(180) },
    { state: "running", from: at(180), to: at(300) },
  ])
})

test("an error makes an alarm from where it is raised to where it goes", () => {
  const past = {
    ...producing(every5s(-5, 300, "Executing"), 300),
    errors: [{ raisedAt: at(62), goneAt: at(131) }],
  }
  assert.deepEqual(spansBetween(at(0), at(300), past), [
    { state: "running", from: at(0), to: at(62) },
    { state: "alarm", from: at(62), to: at(131) },
    { state: "running", from: at(131), to: at(300) },
  ])
})

test("an error that has not gone lasts to the end", () => {
  const past = { ...producing(every5s(-5, 300, "Executing"), 300), errors: [{ raisedAt: at(200), goneAt: null }] }
  assert.deepEqual(spansBetween(at(0), at(300), past).at(-1), { state: "alarm", from: at(200), to: at(300) })
})

test("setup is setup, whatever executes", () => {
  const past = {
    ...producing(every5s(-5, 300, "Executing"), 300),
    operationMode: [...every5s(-5, 95, "Processing"), ...every5s(100, 300, "Setup")],
  }
  assert.deepEqual(spansBetween(at(0), at(300), past), [
    { state: "running", from: at(0), to: at(100) },
    { state: "setup", from: at(100), to: at(300) },
  ])
})

test("a silence is no data from 30 seconds after the last value until the next one", () => {
  const silentBetween = (value: string) => [...every5s(-5, 60, value), ...every5s(200, 300, value)]
  const past = {
    connection: silentBetween("Connected"),
    operationMode: silentBetween("Processing"),
    itemState: silentBetween("Executing"),
    heartbeat: [],
    errors: [],
  }
  const spans = spansBetween(at(0), at(300), past)
  assert.deepEqual(
    spans.map((span) => span.state),
    ["running", "no-data", "running"],
  )
  assert.equal(spans[1]?.from, new Date(Date.parse(at(90)) + 1).toISOString())
  assert.equal(spans[1]?.to, at(200))
})

test("nothing known is no data", () => {
  const past = { connection: [], itemState: [], operationMode: [], heartbeat: [], errors: [] }
  assert.deepEqual(spansBetween(at(0), at(300), past), [{ state: "no-data", from: at(0), to: at(300) }])
})

test("a machine that told its state once keeps it while its heartbeat arrives", () => {
  assert.deepEqual(spansBetween(at(0), at(600), toldOnce(600)), [{ state: "running", from: at(0), to: at(600) }])
})

test("a state that was told once changes with the next value, not before", () => {
  const past = {
    ...toldOnce(600),
    itemState: [
      { at: at(-3600), value: "Executing" },
      { at: at(250), value: "NotExecuting" },
    ],
  }
  assert.deepEqual(spansBetween(at(0), at(600), past), [
    { state: "running", from: at(0), to: at(250) },
    { state: "stopped", from: at(250), to: at(600) },
  ])
})

test("without its heartbeat a machine that told its state once has no data", () => {
  const spans = spansBetween(at(0), at(600), toldOnce(60))
  assert.deepEqual(
    spans.map((span) => span.state),
    ["running", "no-data"],
  )
  assert.equal(spans[1]?.from, new Date(Date.parse(at(90)) + 1).toISOString())

  const never = { ...toldOnce(600), heartbeat: [] }
  assert.deepEqual(spansBetween(at(0), at(600), never), [{ state: "no-data", from: at(0), to: at(600) }])
})

test("a history too long for a band is thinned to the state that lasted longest in each slot", () => {
  const spans = [
    { state: "running" as const, from: at(0), to: at(40) },
    { state: "stopped" as const, from: at(40), to: at(45) },
    { state: "running" as const, from: at(45), to: at(60) },
    { state: "stopped" as const, from: at(60), to: at(100) },
  ]
  // The stop of five seconds is too short for a slot of fifty; the long one stays.
  assert.deepEqual(thinned(spans, 2), [
    { state: "running", from: at(0), to: at(50) },
    { state: "stopped", from: at(50), to: at(100) },
  ])
  // A history that fits stays as it is.
  assert.deepEqual(thinned(spans, 4), spans)
})

test("an alarm is never thinned away: it keeps the slot most of it lies in", () => {
  const spans = [
    { state: "running" as const, from: at(0), to: at(48) },
    { state: "alarm" as const, from: at(48), to: at(51) },
    { state: "running" as const, from: at(51), to: at(100) },
  ]
  assert.deepEqual(thinned(spans, 2), [
    { state: "alarm", from: at(0), to: at(50) },
    { state: "running", from: at(50), to: at(100) },
  ])
  // An alarm that already shows in one slot does not take a second one.
  const long = [
    { state: "running" as const, from: at(0), to: at(10) },
    { state: "alarm" as const, from: at(10), to: at(55) },
    { state: "running" as const, from: at(55), to: at(100) },
  ]
  assert.deepEqual(thinned(long, 2), [
    { state: "alarm", from: at(0), to: at(50) },
    { state: "running", from: at(50), to: at(100) },
  ])
})

test("the sums of a history are added up here, in the order a display reads the states", () => {
  const spans = [
    { state: "no-data" as const, from: at(0), to: at(60) },
    { state: "running" as const, from: at(60), to: at(300) },
    { state: "stopped" as const, from: at(300), to: at(360) },
    { state: "running" as const, from: at(360), to: at(600.5) },
  ]
  assert.deepEqual(totalsOf(spans), [
    { state: "running", seconds: 480.5 },
    { state: "stopped", seconds: 60 },
    { state: "no-data", seconds: 60 },
  ])
  assert.deepEqual(totalsOf([]), [])
})
