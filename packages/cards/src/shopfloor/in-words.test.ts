import assert from "node:assert/strict"
import { test } from "node:test"

import type { Station } from "./contract.ts"
import { shopfloorShowInWords } from "./in-words.ts"

const asOf = "2026-11-16T10:30:00.000+01:00"
const hall = { name: "Hall 1", width: 40, depth: 24, fixtures: [], source: "test" }

const running = (machine: string): Station => ({
  machine,
  state: "running",
  running: true,
  reason: null,
  program: "HOUSING_0815.MPF",
  place: { x: 0, y: 0, width: 4, depth: 3 },
  topics: [],
})

const alarm: Station = {
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
  place: { x: 0, y: 0, width: 4, depth: 3 },
  topics: [],
}

test("a hall where all machines run says so", () => {
  assert.equal(
    shopfloorShowInWords({ asOf, hall, machines: [running("M-02"), running("P-07")], notRunning: 0 }),
    "All 2 machines run.\nRead at 10:30.",
  )
})

test("a machine that does not run is named with its reason, and the running ones follow", () => {
  assert.equal(
    shopfloorShowInWords({ asOf, hall, machines: [running("M-02"), alarm, running("P-07")], notRunning: 1 }),
    [
      "2 of 3 machines run, 1 does not.",
      "P-04: Alarm since 10:20, 10 min. Coolant pressure below minimum (Error 4711).",
      "Running: M-02, P-07.",
      "Read at 10:30.",
    ].join("\n"),
  )
})

test("an empty hall says that it is empty", () => {
  assert.equal(
    shopfloorShowInWords({ asOf, hall, machines: [], notRunning: 0 }),
    "No machine published a value in the last 24 hours.",
  )
})
