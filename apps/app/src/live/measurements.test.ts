import assert from "node:assert/strict"
import { test } from "node:test"

import type { MeasurementList, MeasurementSeries } from "@pleiades/cards/measurement/contract.ts"

import { liveAt, livePageOf, liveWith, measurementFilters } from "./measurements.ts"

const value = (timestamp: string, written: number | boolean | string, unit?: string) =>
  JSON.stringify({ timestamp, value: written, ...(unit ? { unit } : {}) })
const power = "machines/P-04/umati/Consumption/Electricity/Main/AcActivePowerTotal"

/** Four slots of five seconds, 09:29:40 to 09:30:00, and the power of P-04 in them. */
const series: MeasurementSeries = {
  from: "2026-11-16T09:29:40.000Z",
  to: "2026-11-16T09:30:00.000Z",
  instants: ["2026-11-16T09:29:45.000Z", "2026-11-16T09:29:50.000Z", "2026-11-16T09:29:55.000Z", "2026-11-16T09:30:00.000Z"],
  quantities: [
    { quantity: "activePower", unit: "watt", lines: [{ machine: "P-04", topic: power, values: [2900, 2950, 3000, 3010] }] },
    { quantity: "spindleRotating", unit: null, lines: [] },
  ],
}
const current: MeasurementList = {
  asOf: "2026-11-16T09:30:00.000Z",
  machines: [
    {
      machine: "P-04",
      measurements: [
        { quantity: "activePower", value: 3010, unit: "watt", at: "2026-11-16T09:29:58.000Z", stale: false, topic: power },
      ],
    },
  ],
}

test("the page hears every quantity of every machine, and the readings as signs of life", () => {
  const filters = measurementFilters()
  assert.ok(filters.includes("machines/+/umati/Consumption/Electricity/Main/AcActivePowerTotal"))
  assert.ok(filters.includes("machines/+/vendor/Spindle/1/BearingTemperature"))
  assert.ok(filters.includes("machines/+/umati/Connection/Heartbeat"))
})

test("a new value stands next to the title at once", () => {
  const page = liveWith(livePageOf(series, current), power, value("2026-11-16T09:30:01Z", 3100, "watt"))
  assert.deepEqual(page.current?.machines[0]?.measurements[0], {
    quantity: "activePower",
    value: 3100,
    unit: "watt",
    at: "2026-11-16T09:30:01.000Z",
    stale: false,
    topic: power,
  })
})

test("an older value of a quantity does not replace a newer one", () => {
  const page = liveWith(livePageOf(series, current), power, value("2026-11-16T09:29:50Z", 1000, "watt"))
  assert.equal(page.current?.machines[0]?.measurements[0]?.value, 3010)
  assert.equal(page.current?.machines[0]?.measurements[0]?.at, "2026-11-16T09:29:58.000Z")
})

test("the graphs move on by whole slots, each holding the newest value before its end", () => {
  let page = livePageOf(series, current)
  page = liveWith(page, power, value("2026-11-16T09:30:01Z", 3100, "watt"))
  page = liveWith(page, power, value("2026-11-16T09:30:03Z", 3200, "watt"))
  page = liveWith(page, power, value("2026-11-16T09:30:07Z", 3300, "watt"))

  // Not yet a whole slot.
  assert.equal(liveAt(page, "2026-11-16T09:30:04.000Z").series, page.series)

  const later = liveAt(page, "2026-11-16T09:30:11.000Z")
  assert.equal(later.series?.from, "2026-11-16T09:29:50.000Z")
  assert.equal(later.series?.to, "2026-11-16T09:30:10.000Z")
  assert.deepEqual(later.series?.instants, [
    "2026-11-16T09:29:55.000Z",
    "2026-11-16T09:30:00.000Z",
    "2026-11-16T09:30:05.000Z",
    "2026-11-16T09:30:10.000Z",
  ])
  assert.deepEqual(later.series?.quantities[0]?.lines[0]?.values, [3000, 3010, 3200, 3300])
})

test("a value holds until the next one, but not across a silence of its machine", () => {
  const page = livePageOf(series, current)
  // No sign of life after 09:30:00: after 09:30:30 the machine is silent. Eight slots have passed,
  // and the graphs show the last four of them.
  const later = liveAt(page, "2026-11-16T09:30:41.000Z")
  assert.equal(later.series?.to, "2026-11-16T09:30:40.000Z")
  assert.equal(later.series?.instants[0], "2026-11-16T09:30:25.000Z")
  assert.deepEqual(later.series?.quantities[0]?.lines[0]?.values, [3010, 3010, null, null])
  assert.equal(later.current?.machines[0]?.measurements[0]?.stale, true)
})

test("a heartbeat keeps a machine there, and a value of a machine without a line begins one", () => {
  let page = livePageOf(series, current)
  page = liveWith(page, "machines/P-04/umati/Connection/Heartbeat", value("2026-11-16T09:30:25Z", 25396, "one"))
  page = liveWith(page, "machines/M-02/umati/Spindle/1/IsRotating", value("2026-11-16T09:30:02Z", true))
  page = liveWith(page, "machines/M-02/umati/Connection/Heartbeat", value("2026-11-16T09:30:20Z", 1, "one"))
  const later = liveAt(page, "2026-11-16T09:30:21.000Z")
  assert.deepEqual(later.series?.quantities[0]?.lines[0]?.values, [3010, 3010, 3010, 3010])
  assert.deepEqual(later.series?.quantities[1]?.lines, [
    { machine: "M-02", topic: "machines/M-02/umati/Spindle/1/IsRotating", values: [true, true, true, true] },
  ])
  assert.equal(later.current?.machines[0]?.machine, "M-02")
  assert.equal(later.current?.machines[0]?.measurements.find((one) => one.quantity === "spindleRotating")?.value, true)
  assert.equal(later.current?.machines[1]?.measurements[0]?.stale, false)
})

test("a page without graphs still shows the values of now", () => {
  const page = liveWith(livePageOf(null, current), power, value("2026-11-16T09:30:01Z", 3100, "watt"))
  assert.equal(page.series, null)
  assert.equal(page.current?.machines[0]?.measurements[0]?.value, 3100)
})
