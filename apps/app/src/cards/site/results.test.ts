import assert from "node:assert/strict"
import { test } from "node:test"

import { siteListOf } from "./results.ts"

const reading = (topic: string, value: string | null) => ({
  value,
  at: "2026-11-17T09:29:55.000Z",
  since: "2026-11-17T09:00:00.000Z",
  sinceIsLowerBound: false,
  topic: `machines/taygeta-tools_TX-9_M-07/umati/${topic}`,
})

/** A machine on no site as genui_machine_list returns it. */
const now = {
  machine: "taygeta-tools_TX-9_M-07",
  identity: { manufacturer: "Taygeta Tools", model: "TX-9", serialNumber: "M-07" },
  connection: reading("Connection/State", "Running"),
  heartbeat: reading("Connection/Heartbeat", "7"),
  itemState: reading("State/Status/MachineryItemState", "Executing"),
  operationMode: reading("State/Status/MachineryOperationMode", "Automatic"),
  program: reading("WorkMasterMonitoring/ActiveWorkMaster", null),
  jobOrder: null,
  lastValueAt: "2026-11-17T09:29:55.000Z",
  notifications: [],
}

const result = {
  asOf: "2026-11-17T09:30:00.000Z",
  windowSeconds: 1800,
  source: "Sites API /sites and /placements",
  machineCount: 1,
  counts: [{ state: "no-data", machines: 1 }],
  sites: [
    {
      siteId: "north-plant",
      company: "Demo Manufacturing",
      name: "North plant",
      machineCount: 1,
      counts: [{ state: "no-data", machines: 1 }],
      halls: [
        {
          name: "Hall 1",
          machines: [{ machine: "merope-microtec_MM-120_M-02", displayName: null, placedAt: "2026-11-16T08:00:00.000Z", state: "no-data", now: null }],
        },
      ],
    },
  ],
  unplaced: [{ machine: "taygeta-tools_TX-9_M-07", state: "running", now }],
}

test("the JSON of genui_site_list becomes the sites with their machines", () => {
  const list = siteListOf(JSON.stringify(result))
  assert.equal(list?.sites[0]?.halls[0]?.machines[0]?.machine, "merope-microtec_MM-120_M-02")
  assert.equal(list?.unplaced[0]?.machine, "taygeta-tools_TX-9_M-07")
  // A machine on no site carries its topics, so a live page can hear it.
  assert.equal(list?.unplaced[0]?.now.itemState.topic, "machines/taygeta-tools_TX-9_M-07/umati/State/Status/MachineryItemState")
})

test("what does not keep the contract of the card is not drawn as one", () => {
  assert.equal(siteListOf(JSON.stringify({ ...result, sites: [{ siteId: "north-plant" }] })), null)
  assert.equal(siteListOf("no sites"), null)
  assert.equal(siteListOf(undefined), null)
})
