import assert from "node:assert/strict"
import { test } from "node:test"

import type { JobOrderEntry, MachineShow } from "@pleiades/cards/machine/contract.ts"

import { unknownMachine } from "../../live/machines.ts"

import {
  TILE_HEIGHT,
  TILE_WIDTH,
  connector,
  finished,
  floorOf,
  floorWith,
  layout,
  ordersOf,
  pathOf,
  utilisation,
  waiting,
  workingOn,
} from "./floor.ts"
import type { FloorPage } from "./floor.ts"

const asOf = "2026-11-18T09:00:00.000Z"

function show(machine: string, totals: MachineShow["history"]["totals"] = []): MachineShow {
  return {
    asOf,
    windowSeconds: 3600,
    machine: unknownMachine(machine),
    history: { from: "2026-11-18T08:00:00.000Z", to: asOf, totals },
  }
}

const page = (...machines: Array<string>): FloorPage =>
  floorOf({ asOf, machines: machines.map((one) => ({ show: show(one), from: asOf, spans: null })) }, null)

const envelope = (value: unknown) => JSON.stringify({ timestamp: asOf, value })
const now = Date.parse(asOf)

const order = (id: string, state: string, extra: Record<string, unknown> = {}) => ({
  JobOrderID: id,
  State: state,
  StateSince: asOf,
  JobName: "Shaft",
  WorkMasterID: "WM-SHAFT-4711",
  OrderNumbers: [`SO-${id.split("/")[0]}`],
  RunsPlanned: 12,
  JobExecutionMode: "ProductionMode",
  PlannedStartTime: null,
  PlannedEndTime: null,
  ...extra,
})

test("the job orders of a machine come from its retained list, and its results from theirs", () => {
  let floor = page("m1")
  floor = floorWith(floor, "machines/m1/umati/JobMonitoring/JobOrders", envelope([order("4711/01", "Running"), order("4712/01", "AllowedToStart")]), now)
  floor = floorWith(
    floor,
    "machines/m1/umati/JobMonitoring/JobOrderResults",
    envelope([{ JobOrderID: "4711/01", StartTime: "2026-11-18T08:10:00.000Z", EndTime: null, ProducedQuantity: 3, GoodQuantity: 3, JobResult: "Unknown" }]),
    now,
  )
  assert.deepEqual(floor.jobs.m1?.orders?.map((one) => [one.jobOrderId, one.state, one.orderNumbers[0]]), [
    ["4711/01", "Running", "SO-4711"],
    ["4712/01", "AllowedToStart", "SO-4712"],
  ])
  assert.equal(floor.jobs.m1?.results?.[0]?.produced, 3)
  assert.deepEqual(waiting(floor.jobs.m1).map((one) => one.jobOrderId), ["4712/01"])
})

test("a message about something else leaves the job orders as they were", () => {
  const floor = floorWith(page("m1"), "machines/m1/umati/JobMonitoring/JobOrders", envelope([order("1/01", "Running")]), now)
  const after = floorWith(floor, "machines/m1/umati/Spindle/1/IsRotating", envelope(true), now)
  assert.equal(after.jobs, floor.jobs)
})

test("finished job orders stand newest first, with their results", () => {
  let floor = page("m1")
  floor = floorWith(floor, "machines/m1/umati/JobMonitoring/JobOrders", envelope([order("1/01", "Ended"), order("2/01", "Aborted"), order("3/01", "Running")]), now)
  floor = floorWith(
    floor,
    "machines/m1/umati/JobMonitoring/JobOrderResults",
    envelope([
      { JobOrderID: "1/01", StartTime: "2026-11-18T07:00:00.000Z", EndTime: "2026-11-18T07:30:00.000Z", ProducedQuantity: 12 },
      { JobOrderID: "2/01", StartTime: "2026-11-18T07:40:00.000Z", EndTime: "2026-11-18T08:00:00.000Z", ProducedQuantity: 4 },
    ]),
    now,
  )
  assert.deepEqual(finished(floor.jobs.m1).map(({ job, result }) => [job.jobOrderId, result?.produced]), [
    ["2/01", 4],
    ["1/01", 12],
  ])
})

test("job orders that name the same order number are one order, in the order they started", () => {
  let floor = page("m1", "m2")
  floor = floorWith(floor, "machines/m1/umati/JobMonitoring/JobOrders", envelope([order("10/01", "Ended", { OrderNumbers: ["SO-1"] })]), now)
  floor = floorWith(floor, "machines/m1/umati/JobMonitoring/JobOrderResults", envelope([{ JobOrderID: "10/01", StartTime: "2026-11-18T07:00:00.000Z" }]), now)
  floor = floorWith(floor, "machines/m2/umati/JobMonitoring/JobOrders", envelope([order("20/01", "Interrupted", { OrderNumbers: ["SO-1"] }), order("21/01", "AllowedToStart")]), now)
  floor = floorWith(floor, "machines/m2/umati/JobMonitoring/JobOrderResults", envelope([{ JobOrderID: "20/01", StartTime: "2026-11-18T08:00:00.000Z" }]), now)
  const orders = ordersOf(["m1", "m2"], floor.jobs)
  assert.deepEqual(orders.map((one) => [one.number, one.state, one.steps.map((step) => step.machine)]), [
    ["SO-1", "interrupted", ["m1", "m2"]],
    ["SO-21", "waiting", ["m2"]],
  ])
  assert.equal(orders[0]?.at.machine, "m2")
  assert.deepEqual(pathOf(orders[0]!), ["concept:program", "m1", "m2", "concept:pack"])
})

const entry = (machine: string, jobOrderId: string, more: Partial<JobOrderEntry> = {}): JobOrderEntry => ({
  machine,
  jobOrderId,
  state: "Running",
  changedAt: asOf,
  jobName: "Shaft",
  workMaster: null,
  orderNumbers: [],
  runsPlanned: 12,
  plannedStart: null,
  plannedEnd: null,
  start: null,
  end: null,
  produced: null,
  good: null,
  result: null,
  ...more,
})

test("the job orders of the loader stand before the broker sends its lists, with the results of those that started", () => {
  const floor = floorOf(
    { asOf, machines: [{ show: show("m1"), from: asOf, spans: null }] },
    { asOf, windowSeconds: 86_400, jobOrders: [entry("m1", "1/01", { start: asOf, produced: 5 }), entry("m1", "2/01", { state: "AllowedToStart" })] },
  )
  assert.deepEqual(floor.jobs.m1?.orders?.map((one) => one.jobOrderId), ["1/01", "2/01"])
  assert.deepEqual(floor.jobs.m1?.results?.map((one) => [one.jobOrderId, one.produced]), [["1/01", 5]])
})

test("a job order the planner took back before it ran is no order, one aborted while it ran is", () => {
  let floor = page("m1")
  floor = floorWith(floor, "machines/m1/umati/JobMonitoring/JobOrders", envelope([order("1/01", "Aborted"), order("2/01", "Aborted")]), now)
  floor = floorWith(floor, "machines/m1/umati/JobMonitoring/JobOrderResults", envelope([{ JobOrderID: "2/01", StartTime: "2026-11-18T08:00:00.000Z" }]), now)
  assert.deepEqual(ordersOf(["m1"], floor.jobs).map((one) => [one.label, one.state]), [["SO-2", "aborted"]])
  assert.deepEqual(finished(floor.jobs.m1).map(({ job }) => job.jobOrderId), ["2/01"])
})

test("a job order without an order number is an order of its own, also where another machine numbers alike", () => {
  let floor = page("m1", "m2")
  for (const machine of ["m1", "m2"]) {
    floor = floorWith(floor, `machines/${machine}/umati/JobMonitoring/JobOrders`, envelope([order("1/01", "Running", { OrderNumbers: [""] })]), now)
  }
  const orders = ordersOf(["m1", "m2"], floor.jobs)
  assert.equal(orders.length, 2)
  assert.deepEqual(orders.map((one) => [one.number, one.label]), [
    [null, "1/01"],
    [null, "1/01"],
  ])
  assert.notEqual(orders[0]?.key, orders[1]?.key)
})

test("a job order of a state the page does not know waits; it is not done", () => {
  const floor = floorWith(page("m1"), "machines/m1/umati/JobMonitoring/JobOrders", envelope([order("1/01", "Ended"), order("2/01", "Ended", { State: undefined, OrderNumbers: ["SO-1"] })]), now)
  assert.deepEqual(ordersOf(["m1"], floor.jobs).find((one) => one.label === "SO-1")?.state, "waiting")
})

test("instants of the lists are written in one form, so they compare as text", () => {
  const floor = floorWith(
    page("m1"),
    "machines/m1/umati/JobMonitoring/JobOrderResults",
    envelope([{ JobOrderID: "1/01", StartTime: "2026-11-18T09:00:00+01:00", EndTime: "2026-11-18T08:30:00.5Z" }]),
    now,
  )
  assert.deepEqual([floor.jobs.m1?.results?.[0]?.start, floor.jobs.m1?.results?.[0]?.end], ["2026-11-18T08:00:00.000Z", "2026-11-18T08:30:00.500Z"])
})

test("the job order a machine works on is the one its tile names, else the newest that runs or is held up", () => {
  const floor = floorWith(
    page("m1"),
    "machines/m1/umati/JobMonitoring/JobOrders",
    envelope([order("1/01", "Interrupted", { StateSince: "2026-11-18T08:00:00Z" }), order("2/01", "Running", { StateSince: "2026-11-18T08:30:00Z" })]),
    now,
  )
  assert.equal(workingOn(floor.jobs.m1, null)?.jobOrderId, "2/01")
  assert.equal(workingOn(floor.jobs.m1, "1/01")?.jobOrderId, "1/01")
})

test("two steps in a row on the same tile need no line", () => {
  const { places } = layout(["a"])
  assert.deepEqual(connector(places[1]!, places[1]!), [])
})

test("utilisation is the share of the history in which the machine produced", () => {
  assert.equal(utilisation(show("m1", [{ state: "running", seconds: 2700 }, { state: "stopped", seconds: 900 }])), 0.75)
  assert.equal(utilisation(show("m1", [{ state: "stopped", seconds: 60 }])), 0)
  assert.equal(utilisation(show("m1")), null)
})

test("programming stands left of the machines, packing right of them, the machines in columns of three", () => {
  const { places } = layout(["a", "b", "c", "d"])
  const x = Object.fromEntries(places.map((one) => [one.id, one.x]))
  assert.ok(x["concept:program"]! < x.a!)
  assert.equal(x.a, x.c)
  assert.ok(x.d! > x.a!)
  assert.ok(x["concept:pack"]! > x.d!)
})

/** Whether a piece of a line runs through the inside of a tile. */
function crosses([axis, a, b, c]: readonly ["h" | "v", number, number, number], tile: { x: number; y: number }) {
  const inX = (x: number) => x > tile.x && x < tile.x + TILE_WIDTH
  const inY = (y: number) => y > tile.y && y < tile.y + TILE_HEIGHT
  return axis === "h"
    ? inY(c) && b > tile.x && a < tile.x + TILE_WIDTH
    : inX(a) && c > tile.y && b < tile.y + TILE_HEIGHT
}

test("a line runs from the right edge of a tile into the left edge of a tile further right", () => {
  const { places } = layout(["a", "b", "c", "d"])
  const at = Object.fromEntries(places.map((one) => [one.id, one]))
  const line = connector(at.a!, at.d!)
  assert.deepEqual(line[0]?.slice(0, 2), ["h", at.a!.x + TILE_WIDTH])
  assert.equal(line[line.length - 1]?.[2], at.d!.x)
})

test("a line crosses no other tile, whichever two tiles it joins", () => {
  const { places } = layout(["a", "b", "c", "d", "e", "f"])
  for (const from of places) {
    for (const to of places) {
      if (from === to) continue
      const line = connector(from, to)
      for (const other of places.filter((one) => one !== from && one !== to)) {
        assert.ok(!line.some((segment) => crosses(segment, other)), `${from.id} > ${to.id} crosses ${other.id}`)
      }
    }
  }
})
