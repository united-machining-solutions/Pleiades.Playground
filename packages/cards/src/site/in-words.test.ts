import assert from "node:assert/strict"
import { test } from "node:test"

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

const base = {
  asOf: "2026-11-17T09:30:00.000Z",
  windowSeconds: 1800,
  source: "Sites API /sites and /placements",
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
    unplaced: [{ machine: "taygeta-tools_TX-9_M-07", state: "running", lastValueAt: "2026-11-17T09:29:55.000Z" }],
  })
  assert.equal(
    siteListInWords(list),
    [
      "3 machines on 3 sites: 1 running, 1 stopped, 1 no data.",
      "North plant, Demo Manufacturing (site north-plant): 3 machines, 1 running, 1 stopped, 1 no data. Hall 1: AX-400 M-01 (alcyone-machines_AX-400_M-01) running, Mill 2 (merope-microtec_MM-120_M-02) stopped. Hall 2: no machine. No hall: AX-400 M-03 (alcyone-machines_AX-400_M-03) no data.",
      // A hall without a machine is named: a reader asks which hall is free.
      "South plant, Demo Manufacturing (site south-plant): 0 machines. Hall A: no machine.",
      "East plant, Demo Manufacturing (site east-plant): 0 machines, no hall.",
      "Sent values in the last 24 hours and stand on no site: TX-9 M-07 (taygeta-tools_TX-9_M-07) running.",
      "Read at 09:30 UTC.",
    ].join("\n"),
  )
})

test("without a site, the words say so, and name the machines that could be placed", () => {
  const list = siteList.parse({
    ...base,
    machineCount: 0,
    counts: [],
    sites: [],
    unplaced: [{ machine: "taygeta-tools_TX-9_M-07", state: "no-data", lastValueAt: null }],
  })
  assert.equal(
    siteListInWords(list),
    "No site is entered in the Sites API yet.\nSent values in the last 24 hours and stand on no site: TX-9 M-07 (taygeta-tools_TX-9_M-07) no data.\nRead at 09:30 UTC.",
  )
})

test("the contract refuses a count of none: a state no machine is in is left out", () => {
  const count = siteList.shape.counts.safeParse([{ state: "running", machines: 0 }])
  assert.equal(count.success, false)
})
