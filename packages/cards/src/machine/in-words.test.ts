import assert from "node:assert/strict"
import { test } from "node:test"

import type { Machine, Reading } from "./contract.ts"
import { machineInWords, machineListInWords, machineShowInWords } from "./in-words.ts"

// The instants are written as a tool writes them for a person in Zurich: local, with the offset.
const asOf = "2026-11-16T10:30:00.000+01:00"
const justNow = "2026-11-16T10:29:55.000+01:00"

function reading(value: string, changes: Partial<Reading> = {}): Reading {
  return { value, at: justNow, since: "2026-11-16T10:00:00.000+01:00", sinceIsLowerBound: false, topic: "t", ...changes }
}

function machine(changes: Partial<Machine> = {}): Machine {
  return {
    machine: "P-04",
    connection: reading("Connected"),
    heartbeat: reading("2825"),
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
  raisedAt: "2026-11-16T10:28:00.000+01:00",
  topic: "machines/P-04/events/notifications",
})

test("a running machine is its state, since when, and its program", () => {
  assert.equal(machineInWords(machine(), asOf), "P-04: Running since 10:00, 30 min. Program SHAFT_4711.MPF.")
})

test("a time stands as the result writes it, and a time in UTC says so", () => {
  const inUtc = machine({ itemState: reading("Executing", { since: "2026-11-16T09:00:00.000Z" }) })
  assert.equal(machineInWords(inUtc, "2026-11-16T09:30:00.000Z"), "P-04: Running since 09:00 UTC, 30 min. Program SHAFT_4711.MPF.")
})

test("a machine that stands says what is the matter, in the words of the card", () => {
  assert.equal(
    machineInWords(machine({ itemState: reading("NotExecuting") }), asOf),
    "P-04: Stopped since 10:00, 30 min. No alarm, no reason recorded (NotExecuting, as the control reports). Program SHAFT_4711.MPF.",
  )
  assert.equal(
    machineInWords(machine({ notifications: [notification("Error")] }), asOf),
    "P-04: Alarm since 10:28, 2 min. Spindle overtemperature (Error 2130). Program SHAFT_4711.MPF.",
  )
})

test("a state that began before the values that were read is told as a lower bound", () => {
  const long = machine({ itemState: reading("Executing", { sinceIsLowerBound: true }) })
  assert.equal(machineInWords(long, asOf), "P-04: Running since before 10:00, at least 30 min. Program SHAFT_4711.MPF.")
})

test("a silent machine has no data, and no program is named", () => {
  const silent = machine({ lastValueAt: "2026-11-16T10:20:00.000+01:00", itemState: reading("Executing", { at: "2026-11-16T10:20:00.000+01:00" }) })
  assert.equal(
    machineInWords(silent, asOf),
    "P-04: No data since 10:20, 10 min. No data from the adapter (Last known: Executing at 10:20).",
  )
})

test("the card in words has the sums of the history as the backend added them up", () => {
  const history = {
    from: "2026-11-16T02:30:00.000+01:00",
    to: asOf,
    spans: [],
    totals: [
      { state: "running" as const, seconds: 19_680 },
      { state: "stopped" as const, seconds: 2_760 },
      { state: "no-data" as const, seconds: 1_320 },
    ],
  }
  assert.equal(
    machineShowInWords({ asOf, windowSeconds: 1800, machine: machine(), history }),
    [
      "P-04: Running since 10:00, 30 min. Program SHAFT_4711.MPF.",
      "Last 8 hours, 02:30 to 10:30: running 5 h 28 min, stopped 46 min, no data 22 min.",
      "Read at 10:30.",
    ].join("\n"),
  )
})

test("the list in words has a line for each machine", () => {
  const machines = [machine(), machine({ machine: "P-07", itemState: reading("NotExecuting") })]
  const lines = machineListInWords({ asOf, windowSeconds: 1800, machines }).split("\n")
  assert.equal(lines.length, 3)
  assert.match(lines[1] ?? "", /^P-07: Stopped since 10:00/)
  assert.equal(lines[2], "Read at 10:30.")
  assert.equal(machineListInWords({ asOf, windowSeconds: 1800, machines: [] }), "No machine published a value in the last 24 hours.")
})
