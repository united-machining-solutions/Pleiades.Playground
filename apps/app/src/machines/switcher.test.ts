import assert from "node:assert/strict"
import { test } from "node:test"

import type { Machine, MachineList } from "@pleiades/cards/machine/contract.ts"

import { DEFAULT_HOURS, choicesOf, chosenHours, hoursOf, matches } from "./switcher.ts"

test("the hours of the address are one of the three the page offers", () => {
  assert.equal(hoursOf(1), 1)
  assert.equal(hoursOf(8), 8)
  assert.equal(hoursOf(24), 24)
  assert.equal(hoursOf("24"), 24)
})

test("any other hours are no hours: the history of the default is shown", () => {
  for (const raw of [undefined, null, 0, 3, 25, -8, 8.5, "many", "", [], {}]) {
    assert.equal(hoursOf(raw), undefined, String(raw))
  }
})

test("the chosen hours are the ones of the address, or the default for anything else", () => {
  assert.equal(DEFAULT_HOURS, 8)
  assert.equal(chosenHours(1), 1)
  assert.equal(chosenHours("24"), 24)
  assert.equal(chosenHours(undefined), 8)
  assert.equal(chosenHours(3), 8)
  assert.equal(chosenHours("many"), 8)
})

const asOf = "2026-11-17T16:00:00Z"
const reading = (value: string | null) => ({
  value,
  at: value ? asOf : null,
  since: null,
  sinceIsLowerBound: false,
  topic: "t",
})
const machine = (
  id: string,
  model: string,
  serial: string,
  itemState: string,
  notifications: Machine["notifications"] = [],
): Machine => ({
  machine: id,
  identity: { manufacturer: null, model, serialNumber: serial },
  connection: reading("Running"),
  heartbeat: reading("1"),
  itemState: reading(itemState),
  operationMode: reading("Processing"),
  program: reading("WM-SHAFT-4711"),
  jobOrder: null,
  lastValueAt: asOf,
  notifications,
})
const list: MachineList = {
  asOf,
  windowSeconds: 1800,
  machines: [
    machine("alcyone-machines_AX-400_P-04", "AX-400", "P-04", "Executing"),
    machine("taygeta-precision_TP-800_G-21", "TP-800", "G-21", "NotExecuting"),
    machine("merope-microtec_MM-120_M-02", "MM-120", "M-02", "Executing", [
      { correlationId: "c", notificationId: "n", severity: "Failure", level: "Error", title: "Door open", raisedAt: asOf, topic: "t" },
    ]),
  ],
}

test("the switcher offers the machines in the order of the backend, each with its state", () => {
  assert.deepEqual(choicesOf(list), [
    { machine: "alcyone-machines_AX-400_P-04", title: "AX-400 P-04", state: "running" },
    { machine: "taygeta-precision_TP-800_G-21", title: "TP-800 G-21", state: "stopped" },
    { machine: "merope-microtec_MM-120_M-02", title: "MM-120 M-02", state: "alarm" },
  ])
})

test("the search finds a machine by its serial number, its model or its machine id, whatever the case", () => {
  const [p04, g21] = choicesOf(list)
  assert.ok(p04 && g21)
  assert.equal(matches(p04, "p-0"), true)
  assert.equal(matches(p04, "P-04"), true)
  assert.equal(matches(g21, "p-0"), false)
  assert.equal(matches(p04, "ax-400"), true)
  // The manufacturer is in the machine id.
  assert.equal(matches(p04, "alcyone"), true)
  assert.equal(matches(g21, "alcyone"), false)
})

test("the search finds machines by the name of their state", () => {
  assert.deepEqual(
    choicesOf(list).filter((choice) => matches(choice, "alarm")).map((choice) => choice.title),
    ["MM-120 M-02"],
  )
})

test("every word of the search has to be found, and an empty search finds all", () => {
  const choices = choicesOf(list)
  assert.deepEqual(choices.filter((choice) => matches(choice, "m-02 alarm")).map((choice) => choice.title), ["MM-120 M-02"])
  assert.deepEqual(choices.filter((choice) => matches(choice, "m-02 running")), [])
  assert.equal(choices.filter((choice) => matches(choice, "  ")).length, 3)
})
