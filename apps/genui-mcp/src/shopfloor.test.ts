import assert from "node:assert/strict"
import { test } from "node:test"

import type { Machine, MachineList, Reading } from "@pleiades/cards/machine/contract.ts"

import { shopfloorOf, stationOf } from "./shopfloor.ts"

const asOf = "2026-11-16T10:30:00.000+01:00"
const justNow = "2026-11-16T10:29:55.000+01:00"

function reading(value: string, topic: string, changes: Partial<Reading> = {}): Reading {
  return { value, at: justNow, since: "2026-11-16T10:00:00.000+01:00", sinceIsLowerBound: false, topic, ...changes }
}

function machine(serial: string, changes: Partial<Machine> = {}): Machine {
  const base = `machines/${serial}/umati`
  return {
    machine: serial,
    connection: reading("Connected", `${base}/Connection/State`),
    heartbeat: reading("1", `${base}/Connection/Heartbeat`),
    itemState: reading("Executing", `${base}/State/MachineryItemState`),
    operationMode: reading("Processing", `${base}/State/MachineryOperationMode`),
    program: reading("HOUSING_0815.MPF", `${base}/Production/ActiveProgram`),
    lastValueAt: justNow,
    notifications: [],
    ...changes,
  }
}

const place = { x: 1, y: 2, width: 3, depth: 4 }

const coolant = {
  correlationId: "c",
  notificationId: "4711",
  level: "Error" as const,
  title: "Coolant pressure below minimum",
  raisedAt: "2026-11-16T10:20:00.000+01:00",
  topic: "machines/P-04/events/notifications",
}

test("a running machine has no reason and keeps its program", () => {
  const station = stationOf(machine("M-02"), asOf, place)
  assert.equal(station.running, true)
  assert.equal(station.state, "running")
  assert.equal(station.reason, null)
  assert.equal(station.program, "HOUSING_0815.MPF")
})

test("a machine with an open error does not run, and its reason is the error with its topic", () => {
  const station = stationOf(machine("P-04", { notifications: [coolant] }), asOf, place)
  assert.equal(station.running, false)
  assert.equal(station.state, "alarm")
  assert.deepEqual(station.reason, {
    message: "Coolant pressure below minimum",
    detail: "Error 4711",
    since: coolant.raisedAt,
    atLeast: false,
    topic: coolant.topic,
  })
})

test("a silent machine has no data and no program", () => {
  const station = stationOf(machine("P-07", { lastValueAt: "2026-11-16T10:00:00.000+01:00" }), asOf, place)
  assert.equal(station.state, "no-data")
  assert.equal(station.program, null)
  assert.equal(station.reason?.topic, "machines/P-07/umati/Connection/State")
})

test("the shop floor keeps the order of the list and counts the machines that do not run", () => {
  const list: MachineList = {
    asOf,
    windowSeconds: 1800,
    machines: [machine("M-02"), machine("P-04", { notifications: [coolant] }), machine("P-07")],
  }
  const shown = shopfloorOf(list)
  assert.deepEqual(
    shown.machines.map((one) => one.machine),
    ["M-02", "P-04", "P-07"],
  )
  assert.equal(shown.notRunning, 1)
  assert.equal(shown.asOf, asOf)
})

test("a machine stands where the plan puts it, and one the plan does not know gets a free place", () => {
  const list: MachineList = { asOf, windowSeconds: 1800, machines: [machine("P-04"), machine("X-99"), machine("X-98")] }
  const shown = shopfloorOf(list)
  assert.deepEqual(shown.machines[0]?.place, { x: 18.5, y: 4, width: 7, depth: 5.5 })
  const [first, second] = [shown.machines[1]?.place, shown.machines[2]?.place]
  assert.ok(first && second)
  // Two machines the plan does not know do not stand on top of each other.
  assert.ok(first.x + first.width <= second.x)
  assert.ok(shown.hall.width > 0 && shown.hall.fixtures.length > 0)
})
