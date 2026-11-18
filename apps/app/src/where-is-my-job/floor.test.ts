import assert from "node:assert/strict"
import { test } from "node:test"

import type { MachineShow } from "@pleiades/cards/machine/contract.ts"

import { unknownMachine } from "../live/machines.ts"

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
  floorOf({ asOf, machines: machines.map((one) => ({ show: show(one), from: asOf, spans: null })) })

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
  const orders = ordersOf(floor)
  assert.deepEqual(orders.map((one) => [one.number, one.state, one.steps.map((step) => step.machine)]), [
    ["SO-1", "interrupted", ["m1", "m2"]],
    ["SO-21", "waiting", ["m2"]],
  ])
  assert.equal(orders[0]?.at.machine, "m2")
  assert.deepEqual(pathOf(orders[0]!), ["concept:program", "m1", "m2", "concept:pack"])
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
