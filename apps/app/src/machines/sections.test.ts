import assert from "node:assert/strict"
import { test } from "node:test"

import type { MachineMeasurements, MeasurementSeries } from "@pleiades/cards/measurement/contract.ts"
import type { SiteList } from "@pleiades/cards/site/contract.ts"
import type { EnergyShow, MachineEnergy } from "@pleiades/cards/energy/contract.ts"

import {
  alertFilter,
  changesAlerts,
  energyOf,
  energyRequest,
  hasValues,
  measurementsOf,
  oneLine,
  placeOf,
  placeWords,
  powerAndEnergyOf,
  powerRequest,
  rangeOfHours,
} from "./sections.ts"

const P04 = "alcyone-machines_AX-400_P-04"
const P07 = "taygeta-precision_TP-800_P-07"
const M02 = "merope-microtec_MM-120_M-02"

/** A machine as the site card names it; what it does now is not read here. */
const placed = (machine: string) => ({ machine, displayName: null, placedAt: "2026-11-17T08:00:00.000Z", state: "running" as const, now: null })

const sites = {
  asOf: "2026-11-18T10:00:00.000Z",
  windowSeconds: 1800,
  source: "Sites API /sites and /placements",
  machineCount: 2,
  counts: [],
  sites: [
    {
      siteId: "south",
      company: "Pleiades",
      name: "South plant",
      machineCount: 2,
      counts: [],
      halls: [
        { name: "Hall 2", machines: [placed(P04)] },
        { name: null, machines: [placed(P07)] },
      ],
    },
  ],
  unplaced: [{ machine: M02, state: "running", now: {} }],
  sitesError: null,
} as unknown as SiteList

test("a machine stands on its site and in its hall, or on no site", () => {
  assert.deepEqual(placeOf(sites, P04), { site: "South plant", hall: "Hall 2" })
  assert.equal(placeWords(placeOf(sites, P04)), "South plant · Hall 2")
  // Placed on a site but in no hall.
  assert.equal(placeWords(placeOf(sites, P07)), "South plant")
  assert.equal(placeWords(placeOf(sites, M02)), "On no site")
})

test("where the sites could not be read, or the machine is in none of them, the page names no place", () => {
  assert.equal(placeWords(placeOf(null, P04)), null)
  // The Sites API did not answer: every machine is listed on no site, which says nothing of where it stands.
  const unread = { ...sites, sites: [], unplaced: [{ machine: P04, state: "running", now: {} }], sitesError: "no answer" } as unknown as SiteList
  assert.equal(placeWords(placeOf(unread, P04)), null)
  assert.equal(placeWords(placeOf(sites, "gone_X_1")), null)
})

test("the hours of the page are the ranges of the time series card", () => {
  assert.equal(rangeOfHours(1), "1h")
  assert.equal(rangeOfHours(8), "8h")
  assert.equal(rangeOfHours(24), "24h")
})

const measured = (machine: string, power: number | null, energy: number | null): MachineMeasurements => ({
  machine,
  measurements: [
    { quantity: "activePower", value: power, unit: power === null ? null : "watt", at: null, stale: power === null, topic: `machines/${machine}/p` },
    { quantity: "energyImported", value: energy, unit: energy === null ? null : "wattHour", at: null, stale: energy === null, topic: `machines/${machine}/e` },
  ],
})

test("power and energy are shown where the machine has them", () => {
  assert.deepEqual(powerAndEnergyOf(measured(P04, 5000, 812345)), { power: true, energy: true })
  // A meter without power: the energy only.
  assert.deepEqual(powerAndEnergyOf(measured(P04, null, 812345)), { power: false, energy: true })
  // Neither, as a printer or a juice bar: the section says so and asks nothing.
  assert.deepEqual(powerAndEnergyOf(measured(P04, null, null)), { power: false, energy: false })
  // Without the measurements, both are asked for and the tools say what there is.
  assert.deepEqual(powerAndEnergyOf(null), { power: true, energy: true })
})

test("the measurements of one machine, from the list of every machine", () => {
  const list = { asOf: "2026-11-18T10:00:00.000Z", machines: [measured(P04, 1, 2), measured(P07, 3, 4)] }
  assert.equal(measurementsOf(list, P07)?.machine, P07)
  assert.equal(measurementsOf(list, M02), null)
  assert.equal(measurementsOf(null, P04), null)
})

test("the graph of one quantity keeps the line of the machine only", () => {
  const series: MeasurementSeries = {
    from: "2026-11-18T09:45:00.000Z",
    to: "2026-11-18T10:00:00.000Z",
    instants: ["2026-11-18T10:00:00.000Z"],
    quantities: [
      {
        quantity: "activePower",
        unit: "watt",
        lines: [
          { machine: P04, topic: `machines/${P04}/p`, values: [5000] },
          { machine: P07, topic: `machines/${P07}/p`, values: [7000] },
        ],
      },
    ],
  }
  const graph = oneLine(series, "activePower", P07)
  assert.deepEqual(graph?.lines.map((line) => line.machine), [P07])
  assert.equal(graph?.from, series.from)
  assert.equal(oneLine(series, "activePower", M02), null)
  assert.equal(oneLine(series, "spindleRotating", P04), null)
  assert.equal(oneLine(null, "activePower", P04), null)
})

test("an alert event of the machine reads its alerts again, nothing else does", () => {
  const raised = JSON.stringify({
    type: "Notification.AlertRaised",
    time: "2026-11-18T09:59:00.000Z",
    data: { Id: "a-1", ErrorCode: "5120", Message: "Bar feeder empty", Severity: "Failure" },
  })
  const now = Date.parse("2026-11-18T10:00:00.000Z")
  assert.equal(alertFilter(P04), `machines/${P04}/events/notifications`)
  assert.equal(changesAlerts(alertFilter(P04), raised, P04, now), true)
  assert.equal(changesAlerts(alertFilter(P07), raised, P04, now), false)
  // A message that is no alert, such as a notification that does not stay.
  assert.equal(changesAlerts(alertFilter(P04), JSON.stringify({ type: "Notification.NotificationEvent", time: "2026-11-18T09:59:00.000Z", data: {} }), P04, now), false)
})

test("the tile of the energy takes the line of the machine and the hours of the answer", () => {
  const line = (machine: string) => ({ machine, energy: { value: 59_900, unit: "wattHour" } }) as unknown as MachineEnergy
  const show = { hours: 8, machines: [line(P07), line(P04)] } as unknown as EnergyShow
  assert.deepEqual(energyOf(show, P04), { hours: 8, machine: line(P04) })
  assert.equal(energyOf(show, M02), null)
  assert.equal(energyOf(null, P04), null)
})

test("a machine that publishes only its connection has no values, and the section says so", () => {
  assert.equal(hasValues(measured(P04, null, null)), false)
  assert.equal(hasValues(measured(P04, 5000, null)), true)
  assert.equal(hasValues(null), false)
})

test("the section of power and energy asks for the hours of the page, also when it asks again", () => {
  assert.deepEqual(powerRequest(P04, 24), { lines: [{ machine: P04, signal: "activePower" }], range: "24h" })
  assert.deepEqual(powerRequest(P04, 1).range, "1h")
  assert.deepEqual(energyRequest(P04, 24), { machines: [P04], hours: 24 })
})
