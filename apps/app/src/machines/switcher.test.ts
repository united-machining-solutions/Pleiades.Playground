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
const machine = (serial: string, itemState: string, notifications: Machine["notifications"] = []): Machine => ({
  machine: serial,
  connection: reading("Connected"),
  heartbeat: reading("1"),
  itemState: reading(itemState),
  operationMode: reading("Automatic"),
  program: reading("Program1.nc"),
  lastValueAt: asOf,
  notifications,
})
const list: MachineList = {
  asOf,
  windowSeconds: 1800,
  machines: [
    machine("P-04", "Executing"),
    machine("G-21", "NotExecuting"),
    machine("M-02", "Executing", [
      { correlationId: "c", notificationId: "n", level: "Error", title: "Door open", raisedAt: asOf, topic: "t" },
    ]),
  ],
}

test("the switcher offers the machines in the order of the backend, each with its state", () => {
  assert.deepEqual(choicesOf(list), [
    { machine: "P-04", state: "running" },
    { machine: "G-21", state: "stopped" },
    { machine: "M-02", state: "alarm" },
  ])
})

test("the search finds a machine by its serial number, whatever the case", () => {
  const [p04, g21] = choicesOf(list)
  assert.ok(p04 && g21)
  assert.equal(matches(p04, "p-0"), true)
  assert.equal(matches(p04, "P-04"), true)
  assert.equal(matches(g21, "p-0"), false)
})

test("the search finds machines by the name of their state", () => {
  assert.deepEqual(
    choicesOf(list).filter((choice) => matches(choice, "alarm")).map((choice) => choice.machine),
    ["M-02"],
  )
})

test("every word of the search has to be found, and an empty search finds all", () => {
  const choices = choicesOf(list)
  assert.deepEqual(choices.filter((choice) => matches(choice, "m-02 alarm")).map((choice) => choice.machine), ["M-02"])
  assert.deepEqual(choices.filter((choice) => matches(choice, "m-02 running")), [])
  assert.equal(choices.filter((choice) => matches(choice, "  ")).length, 3)
})
