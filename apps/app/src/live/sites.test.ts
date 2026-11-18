import assert from "node:assert/strict"
import { test } from "node:test"

import type { Machine } from "@pleiades/cards/machine/contract.ts"
import type { PlacedMachine, SiteList } from "@pleiades/cards/site/contract.ts"

import { unknownMachine } from "./machines.ts"
import { countsOf, sitesAt, sitesWith } from "./sites.ts"

const P04 = "alcyone-machines_AX-400_P-04"
const M09 = "alcyone-machines_AX-400_M-09"
const P07 = "taygeta-precision_TP-800_P-07"
/** The clock of the server in these tests: after every value they send, so none is stamped ahead of it. */
const NOW = Date.parse("2026-11-18T09:32:00Z")

const value = (timestamp: string, written: unknown) => JSON.stringify({ timestamp, value: written })
const status = (timestamp: string, itemState: string, operationMode = "Processing") =>
  value(timestamp, { MachineryItemState: itemState, MachineryOperationMode: operationMode })

/** P-04, executing since 09:00, its newest sign of life at 09:29:50. */
function p04(): Machine {
  const machine = unknownMachine(P04)
  const at = "2026-11-18T09:29:50.000Z"
  return {
    ...machine,
    identity: { manufacturer: "Alcyone Machine Works", model: "AX-400", serialNumber: "P-04" },
    connection: { ...machine.connection, value: "Running", at, since: "2026-11-18T08:00:00.000Z" },
    itemState: { ...machine.itemState, value: "Executing", at, since: "2026-11-18T09:00:00.000Z" },
    operationMode: { ...machine.operationMode, value: "Processing", at, since: "2026-11-18T08:00:00.000Z" },
    lastValueAt: at,
  }
}

/** P-07, in setup since 09:20, its newest sign of life at 09:29:55. */
function p07(): Machine {
  const machine = unknownMachine(P07)
  const at = "2026-11-18T09:29:55.000Z"
  return {
    ...machine,
    identity: { manufacturer: "Taygeta Precision", model: "TP-800", serialNumber: "P-07" },
    connection: { ...machine.connection, value: "Running", at, since: "2026-11-18T08:00:00.000Z" },
    itemState: { ...machine.itemState, value: "NotExecuting", at, since: "2026-11-18T09:20:00.000Z" },
    operationMode: { ...machine.operationMode, value: "Setup", at, since: "2026-11-18T09:20:00.000Z" },
    lastValueAt: at,
  }
}

const placed = (machine: string, state: PlacedMachine["state"], now: Machine | null): PlacedMachine => ({
  machine,
  displayName: null,
  placedAt: "2026-11-17T08:00:00.000Z",
  state,
  now,
})

/** P-04 running in Hall 1 of the North plant, M-09 without data in no hall of the South plant, P-07 on no site. */
const list: SiteList = {
  asOf: "2026-11-18T09:30:00.000Z",
  windowSeconds: 1800,
  source: "Sites API /sites and /placements",
  machineCount: 2,
  counts: [
    { state: "running", machines: 1 },
    { state: "no-data", machines: 1 },
  ],
  sites: [
    {
      siteId: "north-plant",
      company: "Demo Manufacturing",
      name: "North plant",
      machineCount: 1,
      counts: [{ state: "running", machines: 1 }],
      halls: [{ name: "Hall 1", machines: [placed(P04, "running", p04())] }],
    },
    {
      siteId: "south-plant",
      company: "Demo Manufacturing",
      name: "South plant",
      machineCount: 1,
      counts: [{ state: "no-data", machines: 1 }],
      halls: [{ name: null, machines: [placed(M09, "no-data", null)] }],
    },
  ],
  unplaced: [{ machine: P07, state: "setup", now: p07() }],
}

const north = (sites: SiteList) => sites.sites[0]!
const south = (sites: SiteList) => sites.sites[1]!

test("the counts stand in the order a display reads the states, without a state no machine is in", () => {
  assert.deepEqual(countsOf(["no-data", "running", "alarm", "running"]), [
    { state: "running", machines: 2 },
    { state: "alarm", machines: 1 },
    { state: "no-data", machines: 1 },
  ])
  assert.deepEqual(countsOf([]), [])
})

test("a machine on a site that stops: its state, the counts of its site and of all sites follow", () => {
  const next = sitesWith(list, `machines/${P04}/umati/State/Status`, status("2026-11-18T09:31:00Z", "OutOfService"), NOW)
  assert.equal(north(next).halls[0]!.machines[0]!.state, "stopped")
  assert.deepEqual(north(next).counts, [{ state: "stopped", machines: 1 }])
  assert.deepEqual(next.counts, [
    { state: "stopped", machines: 1 },
    { state: "no-data", machines: 1 },
  ])
  // The other site stays as it was.
  assert.deepEqual(south(next), south(list))
})

test("a machine without data that sends again gets its values with its first sign of life", () => {
  const next = sitesWith(list, `machines/${M09}/umati/State/Status`, status("2026-11-18T09:31:30Z", "Executing"), NOW)
  const m09 = south(next).halls[0]!.machines[0]!
  assert.equal(m09.now?.itemState.value, "Executing")
  assert.equal(m09.now?.lastValueAt, "2026-11-18T09:31:30.000Z")
  assert.deepEqual(south(next).counts, [{ state: m09.state, machines: 1 }])
})

test("a retained value older than the backend looks for a machine does not wake a machine without data", () => {
  const next = sitesWith(list, `machines/${M09}/umati/State/Status`, status("2026-11-16T09:00:00Z", "Executing"), NOW)
  assert.equal(next, list)
})

test("a machine on no site follows the broker as well, and the counts of the sites stay without it", () => {
  const next = sitesWith(list, `machines/${P07}/umati/State/Status`, status("2026-11-18T09:31:00Z", "Executing"), NOW)
  const p07 = next.unplaced[0]!
  assert.equal(p07.now.itemState.value, "Executing")
  assert.equal(p07.state, "running")
  assert.deepEqual(next.counts, list.counts)
  assert.deepEqual(next.sites, list.sites)
})

test("a message of a machine the list does not hold, or of no machine at all, changes nothing", () => {
  const stranger = "taygeta-tools_TX-9_M-07"
  assert.equal(sitesWith(list, `machines/${stranger}/umati/State/Status`, status("2026-11-18T09:31:00Z", "Executing"), NOW), list)
  assert.equal(sitesWith(list, "sites/north-plant/energy", value("2026-11-18T09:31:00Z", 3), NOW), list)
})

test("as time passes, a machine that falls silent has no data, and its site counts it so", () => {
  const later = sitesAt(list, "2026-11-18T09:31:00.000Z")
  assert.equal(later.asOf, "2026-11-18T09:31:00.000Z")
  assert.equal(north(later).halls[0]!.machines[0]!.state, "no-data")
  assert.deepEqual(north(later).counts, [{ state: "no-data", machines: 1 }])
  assert.deepEqual(later.counts, [{ state: "no-data", machines: 2 }])
})

test("as time passes, a machine on no site that falls silent has no data too", () => {
  const later = sitesAt(list, "2026-11-18T09:31:00.000Z")
  assert.equal(later.unplaced[0]!.state, "no-data")
  assert.deepEqual(later.counts, [{ state: "no-data", machines: 2 }])
})

test("an earlier instant changes nothing", () => {
  assert.equal(sitesAt(list, "2026-11-18T09:29:00.000Z"), list)
})
