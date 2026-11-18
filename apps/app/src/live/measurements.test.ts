import assert from "node:assert/strict"
import { test } from "node:test"

import type { MeasurementList, MeasurementSeries } from "@pleiades/cards/measurement/contract.ts"

import { liveAt, livePageOf, liveWith, measurementFilters } from "./measurements.ts"

const value = (timestamp: string, written: unknown, unit?: string) =>
  JSON.stringify({ timestamp, value: written, ...(unit ? { unit } : {}) })
const P04 = "alcyone-machines_AX-400_P-04"
const M02 = "merope-microtec_MM-120_M-02"
const power = `machines/${P04}/umati/Consumption/Electricity/Main/AcActivePowerTotal`
/** The clock of the server in these tests: after every value they send, so none is stamped ahead of it. */
const NOW = Date.parse("2026-11-16T09:32:00Z")

/** Four slots of five seconds, 09:29:40 to 09:30:00, and the power of P-04 in them. */
const series: MeasurementSeries = {
  from: "2026-11-16T09:29:40.000Z",
  to: "2026-11-16T09:30:00.000Z",
  instants: ["2026-11-16T09:29:45.000Z", "2026-11-16T09:29:50.000Z", "2026-11-16T09:29:55.000Z", "2026-11-16T09:30:00.000Z"],
  quantities: [
    { quantity: "activePower", unit: "watt", lines: [{ machine: P04, topic: power, values: [2900, 2950, 3000, 3010] }] },
    { quantity: "spindleRotating", unit: null, lines: [] },
  ],
}
const current: MeasurementList = {
  asOf: "2026-11-16T09:30:00.000Z",
  machines: [
    {
      machine: P04,
      measurements: [
        { quantity: "activePower", value: 3010, unit: "watt", at: "2026-11-16T09:29:58.000Z", stale: false, topic: power },
      ],
    },
  ],
}

test("the page hears every quantity of every machine, and the readings as signs of life", () => {
  const filters = measurementFilters()
  assert.ok(filters.includes("machines/+/umati/Consumption/Electricity/Main/AcActivePowerTotal"))
  // A signal of the machine manufacturer lies in the namespace `oem`.
  assert.ok(filters.includes("machines/+/oem/Spindle/1/BearingTemperature"))
  assert.ok(filters.includes("machines/+/umati/Connection/Heartbeat"))
  // The state is a snapshot: one topic at the broker, heard once.
  assert.equal(filters.filter((filter) => filter === "machines/+/umati/State/Status").length, 1)
  // Its fields are heard one by one as well, for an adapter that sends no snapshot.
  assert.ok(filters.includes("machines/+/umati/State/Status/MachineryItemState"))
})

test("a new value stands next to the title at once", () => {
  const page = liveWith(livePageOf(series, current), power, value("2026-11-16T09:30:01Z", 3100, "watt"), NOW)
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
  const page = liveWith(livePageOf(series, current), power, value("2026-11-16T09:29:50Z", 1000, "watt"), NOW)
  assert.equal(page.current?.machines[0]?.measurements[0]?.value, 3010)
  assert.equal(page.current?.machines[0]?.measurements[0]?.at, "2026-11-16T09:29:58.000Z")
})

test("the graphs move on by whole slots, each holding the newest value before its end", () => {
  let page = livePageOf(series, current)
  page = liveWith(page, power, value("2026-11-16T09:30:01Z", 3100, "watt"), NOW)
  page = liveWith(page, power, value("2026-11-16T09:30:03Z", 3200, "watt"), NOW)
  page = liveWith(page, power, value("2026-11-16T09:30:07Z", 3300, "watt"), NOW)

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
  page = liveWith(page, `machines/${P04}/umati/Connection/Heartbeat`, value("2026-11-16T09:30:25Z", 25396), NOW)
  page = liveWith(page, `machines/${M02}/umati/Spindle/1/IsRotating`, value("2026-11-16T09:30:02Z", true), NOW)
  page = liveWith(page, `machines/${M02}/umati/Connection/Heartbeat`, value("2026-11-16T09:30:20Z", 1), NOW)
  const later = liveAt(page, "2026-11-16T09:30:21.000Z")
  assert.deepEqual(later.series?.quantities[0]?.lines[0]?.values, [3010, 3010, 3010, 3010])
  assert.deepEqual(later.series?.quantities[1]?.lines, [
    { machine: M02, topic: `machines/${M02}/umati/Spindle/1/IsRotating`, values: [true, true, true, true] },
  ])
  assert.equal(later.current?.machines[1]?.machine, M02)
  assert.equal(later.current?.machines[1]?.measurements.find((one) => one.quantity === "spindleRotating")?.value, true)
  assert.equal(later.current?.machines[0]?.measurements[0]?.stale, false)
})

test("a page without graphs still shows the values of now", () => {
  const page = liveWith(livePageOf(null, current), power, value("2026-11-16T09:30:01Z", 3100, "watt"), NOW)
  assert.equal(page.series, null)
  assert.equal(page.current?.machines[0]?.measurements[0]?.value, 3100)
})

test("a snapshot of the state is a sign of life, as its stored fields are for the backend", () => {
  let page = livePageOf(series, current)
  const status = { MachineryItemState: "Executing", MachineryOperationMode: "Processing" }
  page = liveWith(page, `machines/${P04}/umati/State/Status`, value("2026-11-16T09:30:35Z", status), NOW)
  assert.equal(page.lastSign[P04], "2026-11-16T09:30:35.000Z")
  const later = liveAt(page, "2026-11-16T09:30:41.000Z")
  assert.equal(later.current?.machines[0]?.measurements[0]?.stale, false)
})

test("the energy keeps the unit of the data model, watt hours; nothing is converted", () => {
  const energy = `machines/${P04}/umati/Consumption/Electricity/Main/AcActiveEnergyTotalImportHp`
  const withEnergy: MeasurementList = {
    ...current,
    machines: [
      { machine: P04, measurements: [{ quantity: "energyImported", value: null, unit: null, at: null, stale: true, topic: energy }] },
    ],
  }
  const page = liveWith(livePageOf(null, withEnergy), energy, value("2026-11-16T09:30:01Z", 1850.5, "wattHour"), NOW)
  assert.equal(page.current?.machines[0]?.measurements[0]?.value, 1850.5)
  assert.equal(page.current?.machines[0]?.measurements[0]?.unit, "wattHour")
})

test("a retained value of a machine that is long gone begins no row and no line", () => {
  const page = livePageOf(series, current)
  const old = liveWith(page, `machines/${M02}/umati/Spindle/1/IsRotating`, value("2026-11-14T09:00:00Z", true), NOW)
  assert.equal(old, page)
})
