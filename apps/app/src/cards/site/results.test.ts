import assert from "node:assert/strict"
import { test } from "node:test"

import { siteListOf } from "./results.ts"

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
  unplaced: [{ machine: "taygeta-tools_TX-9_M-07", state: "running", lastValueAt: "2026-11-17T09:29:55.000Z" }],
}

test("the JSON of genui_site_list becomes the sites with their machines", () => {
  const list = siteListOf(JSON.stringify(result))
  assert.equal(list?.sites[0]?.halls[0]?.machines[0]?.machine, "merope-microtec_MM-120_M-02")
  assert.equal(list?.unplaced[0]?.machine, "taygeta-tools_TX-9_M-07")
})

test("what does not keep the contract of the card is not drawn as one", () => {
  assert.equal(siteListOf(JSON.stringify({ ...result, sites: [{ siteId: "north-plant" }] })), null)
  assert.equal(siteListOf("no sites"), null)
  assert.equal(siteListOf(undefined), null)
})
