import assert from "node:assert/strict"
import { test } from "node:test"

import type { Machine } from "../machine/contract.ts"
import { siteList } from "./contract.ts"
import type { PlacedMachine } from "./contract.ts"
import { siteListInWords } from "./in-words.ts"

const placed = (machine: string, state: PlacedMachine["state"], displayName: string | null = null): PlacedMachine => ({
  machine,
  displayName,
  placedAt: "2026-11-16T08:00:00.000Z",
  state,
  now: null,
})

/** A machine as genui_machine_list returns it, with its identification, or none where it reported none. */
const sending = (machine: string, model: string | null, serialNumber: string | null): Machine => {
  const reading = (path: string, value: string | null) => ({
    value,
    at: "2026-11-17T09:29:55.000Z",
    since: "2026-11-17T09:00:00.000Z",
    sinceIsLowerBound: false,
    topic: `machines/${machine}/umati/${path}`,
  })
  return {
    machine,
    identity: { manufacturer: model === null ? null : "Taygeta Tools", model, serialNumber },
    connection: reading("Connection/State", "Running"),
    heartbeat: reading("Connection/Heartbeat", "7"),
    itemState: reading("State/Status/MachineryItemState", "Executing"),
    operationMode: reading("State/Status/MachineryOperationMode", "Automatic"),
    program: reading("WorkMasterMonitoring/ActiveWorkMaster", null),
    jobOrder: null,
    lastValueAt: "2026-11-17T09:29:55.000Z",
    notifications: [],
  }
}

const base = {
  asOf: "2026-11-17T09:30:00.000Z",
  windowSeconds: 1800,
  source: "Sites API /sites and /placements",
  sitesError: null,
} as const

test("the site card in words: a line for each site with its halls, an empty one too, and the machines on no site", () => {
  const list = siteList.parse({
    ...base,
    machineCount: 3,
    counts: [
      { state: "running", machines: 1 },
      { state: "stopped", machines: 1 },
      { state: "no-data", machines: 1 },
    ],
    sites: [
      {
        siteId: "north-plant",
        company: "Demo Manufacturing",
        name: "North plant",
        machineCount: 3,
        counts: [
          { state: "running", machines: 1 },
          { state: "stopped", machines: 1 },
          { state: "no-data", machines: 1 },
        ],
        halls: [
          { name: "Hall 1", machines: [placed("alcyone-machines_AX-400_M-01", "running"), placed("merope-microtec_MM-120_M-02", "stopped", "Mill 2")] },
          { name: "Hall 2", machines: [] },
          { name: null, machines: [placed("alcyone-machines_AX-400_M-03", "no-data")] },
        ],
      },
      {
        siteId: "south-plant",
        company: "Demo Manufacturing",
        name: "South plant",
        machineCount: 0,
        counts: [],
        halls: [{ name: "Hall A", machines: [] }],
      },
      { siteId: "east-plant", company: "Demo Manufacturing", name: "East plant", machineCount: 0, counts: [], halls: [] },
    ],
    unplaced: [
      {
        machine: "taygeta-tools_TX-9_M-07",
        state: "running",
        // The identification names the machine, also where it differs from its id.
        now: sending("taygeta-tools_TX-9_M-07", "TX-9 Pro", "M-07"),
      },
    ],
  })
  assert.equal(
    siteListInWords(list),
    [
      "3 machines on 3 sites: 1 running, 1 stopped, 1 no data.",
      "North plant, Demo Manufacturing (site north-plant): 3 machines, 1 running, 1 stopped, 1 no data. Hall 1: AX-400 M-01 (alcyone-machines_AX-400_M-01) running, Mill 2 (merope-microtec_MM-120_M-02) stopped. Hall 2: no machine. No hall: AX-400 M-03 (alcyone-machines_AX-400_M-03) no data.",
      // A hall without a machine is named: a reader asks which hall is free.
      "South plant, Demo Manufacturing (site south-plant): 0 machines. Hall A: no machine.",
      "East plant, Demo Manufacturing (site east-plant): 0 machines, no hall.",
      "Sent values in the last 24 hours and stand on no site: TX-9 Pro M-07 (taygeta-tools_TX-9_M-07) running.",
      "Read at 09:30 UTC.",
    ].join("\n"),
  )
})

test("without a site, the words say so, and name the machines that could be placed, by their id where they report no identification", () => {
  const list = siteList.parse({
    ...base,
    machineCount: 0,
    counts: [],
    sites: [],
    unplaced: [
      // A source that sends no identification: the model and serial number come from the id, which is not said twice.
      { machine: "taygeta-tools_TX-9_M-07", state: "no-data", now: sending("taygeta-tools_TX-9_M-07", null, null) },
    ],
  })
  assert.equal(
    siteListInWords(list),
    "No site is entered in the Sites API yet.\nSent values in the last 24 hours and stand on no site: TX-9 M-07 (taygeta-tools_TX-9_M-07) no data.\nRead at 09:30 UTC.",
  )
})

test("where the sites cannot be read, the words say so, not that none is entered, and name every machine that sends", () => {
  const list = siteList.parse({
    ...base,
    machineCount: 0,
    counts: [],
    sites: [],
    unplaced: [{ machine: "taygeta-tools_TX-9_M-07", state: "running", now: sending("taygeta-tools_TX-9_M-07", "TX-9", "M-07") }],
    sitesError: "The Sites API did not answer: ECONNREFUSED (http://sites:8080/sites).",
  })
  assert.equal(
    siteListInWords(list),
    [
      "The sites cannot be read now: The Sites API did not answer: ECONNREFUSED (http://sites:8080/sites). Every machine that sent values in the last 24 hours is listed as on no site.",
      "Sent values in the last 24 hours and stand on no site: TX-9 M-07 (taygeta-tools_TX-9_M-07) running.",
      "Read at 09:30 UTC.",
    ].join("\n"),
  )
})

test("the contract refuses a count of none: a state no machine is in is left out", () => {
  const count = siteList.shape.counts.safeParse([{ state: "running", machines: 0 }])
  assert.equal(count.success, false)
})
