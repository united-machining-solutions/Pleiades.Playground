import assert from "node:assert/strict"
import { test } from "node:test"

import type { Machine, Reading } from "./contract.ts"
import { duration } from "./format.ts"
import { stateOf } from "./state.ts"

const asOf = "2026-11-16T09:30:00.000Z"
const justNow = "2026-11-16T09:29:55.000Z"

function reading(value: string): Reading {
  return { value, at: justNow, since: "2026-11-16T09:00:00.000Z", sinceIsLowerBound: false, topic: "t" }
}

function machine(changes: Partial<Machine> = {}): Machine {
  return {
    machine: "P-04",
    connection: reading("Connected"),
    itemState: reading("Executing"),
    operationMode: reading("Processing"),
    program: reading("SHAFT_4711.MPF"),
    lastValueAt: justNow,
    notifications: [],
    ...changes,
  }
}

const notification = (level: "Warning" | "Error") => ({
  correlationId: "c",
  notificationId: "2130",
  level,
  title: "Spindle overtemperature",
  raisedAt: justNow,
  topic: "machines/P-04/events/notifications",
})

test("connected, executing and processing is running", () => {
  assert.equal(stateOf(machine(), asOf), "running")
})

test("an open warning leaves a running machine running", () => {
  assert.equal(stateOf(machine({ notifications: [notification("Warning")] }), asOf), "running")
})

test("an open error is an alarm, whatever the machine reports", () => {
  assert.equal(stateOf(machine({ notifications: [notification("Error")] }), asOf), "alarm")
})

test("not executing without an error is stopped", () => {
  assert.equal(stateOf(machine({ itemState: reading("NotExecuting") }), asOf), "stopped")
})

test("setup mode is setup, also while nothing executes", () => {
  const inSetup = { operationMode: reading("Setup"), itemState: reading("NotExecuting") }
  assert.equal(stateOf(machine(inSetup), asOf), "setup")
})

test("a machine that went silent has no data, even with an open error", () => {
  const silent = { lastValueAt: "2026-11-16T09:20:00.000Z", notifications: [notification("Error")] }
  assert.equal(stateOf(machine(silent), asOf), "no-data")
  assert.equal(stateOf(machine({ lastValueAt: null }), asOf), "no-data")
})

test("a machine that is not connected has no data", () => {
  assert.equal(stateOf(machine({ connection: reading("Disconnected") }), asOf), "no-data")
})

test("durations read like on a shop floor", () => {
  assert.equal(duration("2026-11-16T09:29:40.000Z", asOf), "under 1 min")
  assert.equal(duration("2026-11-16T08:52:00.000Z", asOf), "38 min")
  assert.equal(duration("2026-11-16T08:30:00.000Z", asOf), "1 h")
  assert.equal(duration("2026-11-16T08:00:00.000Z", asOf), "1 h 30 min")
})
