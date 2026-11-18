import assert from "node:assert/strict"
import { test } from "node:test"

import type { Machine } from "@pleiades/cards/machine/contract.ts"
import type { PlacedMachine, Site, SiteList } from "@pleiades/cards/site/contract.ts"

import { unknownMachine } from "../live/machines.ts"
import { SITES_PER_PAGE, changed, emptyOf, groupsOf, matches, pageOf, pageOfSearch, showOf, showOfToggle } from "./filter.ts"
import type { Group } from "./filter.ts"

const P04 = "alcyone-machines_AX-400_P-04"
const M02 = "merope-microtec_MM-120_M-02"
const M09 = "alcyone-machines_AX-400_M-09"
const P07 = "taygeta-precision_TP-800_P-07"

function sending(id: string, model: string, serialNumber: string, program: string): Machine {
  const machine = unknownMachine(id)
  return {
    ...machine,
    identity: { manufacturer: null, model, serialNumber },
    program: { ...machine.program, value: program, at: "2026-11-18T09:00:00.000Z" },
    lastValueAt: "2026-11-18T09:29:00.000Z",
  }
}

const placed = (
  machine: string,
  state: PlacedMachine["state"],
  now: Machine | null,
  displayName: string | null = null,
): PlacedMachine => ({ machine, displayName, placedAt: "2026-11-17T08:00:00.000Z", state, now })

/**
 * North plant with Hall 1 (Lathe 4, setup), Hall 2 (M-02, running) and an empty Hall 3; South plant
 * with M-09 in no hall, without data; West plant without a machine; P-07 in alarm on no site.
 */
const list: SiteList = {
  asOf: "2026-11-18T09:30:00.000Z",
  windowSeconds: 1800,
  source: "Sites API /sites and /placements",
  machineCount: 3,
  counts: [
    { state: "running", machines: 1 },
    { state: "setup", machines: 1 },
    { state: "no-data", machines: 1 },
  ],
  sites: [
    {
      siteId: "north-plant",
      company: "Demo Manufacturing",
      name: "North plant",
      machineCount: 2,
      counts: [
        { state: "running", machines: 1 },
        { state: "setup", machines: 1 },
      ],
      halls: [
        { name: "Hall 1", machines: [placed(P04, "setup", sending(P04, "AX-400", "P-04", "SHAFT-12"), "Lathe 4")] },
        { name: "Hall 2", machines: [placed(M02, "running", sending(M02, "MM-120", "M-02", "GEAR-7"))] },
        { name: "Hall 3", machines: [] },
      ],
    },
    {
      siteId: "south-plant",
      company: "Demo Manufacturing",
      name: "South plant",
      machineCount: 1,
      counts: [{ state: "no-data", machines: 1 }],
      halls: [{ name: null, machines: [placed(M09, "no-data", null)] }],
    },
    { siteId: "west-plant", company: "Demo Manufacturing", name: "West plant", machineCount: 0, counts: [], halls: [{ name: "Hall W", machines: [] }] },
  ],
  unplaced: [{ machine: P07, state: "alarm", now: sending(P07, "TP-800", "P-07", "HOUSING-0815") }],
}

/** Each group as its site, and hall by hall the ids of the machines shown. */
const names = (groups: ReadonlyArray<Group>) =>
  groups.map((group) => [group.site?.name ?? null, group.halls.map((hall) => [hall.name, hall.rows.map((row) => row.machine.machine)])])

test("without a filter every site with a machine is a group, with the halls that hold one, and the machines on no site come last", () => {
  const { groups, emptySites } = groupsOf(list, { needs: false, query: "" })
  assert.deepEqual(names(groups), [
    [
      "North plant",
      [
        ["Hall 1", [P04]],
        ["Hall 2", [M02]],
      ],
    ],
    ["South plant", [["No hall", [M09]]]],
    [null, [["", [P07]]]],
  ])
  assert.deepEqual(groups[0]!.emptyHalls, ["Hall 3"])
  assert.deepEqual(
    emptySites.map((site) => site.name),
    ["West plant"],
  )
})

test("needs you keeps the machines in alarm, stopped or without data, each in its site and hall", () => {
  const { groups, emptySites } = groupsOf(list, { needs: true, query: "" })
  assert.deepEqual(names(groups), [
    ["South plant", [["No hall", [M09]]]],
    [null, [["", [P07]]]],
  ])
  assert.deepEqual(groups[0]!.emptyHalls, [])
  assert.deepEqual(emptySites, [])
})

test("a search finds a machine by its name, what it is, its id, its work master, its hall and its site", () => {
  const found = (query: string) => names(groupsOf(list, { needs: false, query }).groups)
  assert.deepEqual(found("lathe"), [["North plant", [["Hall 1", [P04]]]]])
  assert.deepEqual(found("mm-120"), [["North plant", [["Hall 2", [M02]]]]])
  assert.deepEqual(found("AX-400_M-09"), [["South plant", [["No hall", [M09]]]]])
  assert.deepEqual(found("gear"), [["North plant", [["Hall 2", [M02]]]]])
  assert.deepEqual(found("south"), [["South plant", [["No hall", [M09]]]]])
  assert.deepEqual(found("housing"), [[null, [["", [P07]]]]])
  assert.deepEqual(found("west"), [])
  assert.deepEqual(groupsOf(list, { needs: false, query: "lathe" }).emptySites, [])
})

test("every word of a search must be found, and case does not matter", () => {
  const north = list.sites[0]!
  const hall = north.halls[0]!
  const lathe = hall.machines[0]!
  assert.equal(matches(lathe, hall, north, "LATHE setup"), true)
  assert.equal(matches(lathe, hall, north, "lathe running"), false)
  assert.equal(matches(lathe, hall, north, ""), true)
})

test("a group keeps the counts the backend gave for its whole site, also where a filter shows fewer machines", () => {
  const [north] = groupsOf(list, { needs: false, query: "lathe" }).groups
  assert.equal(north!.machines, 1)
  assert.deepEqual(north!.counts, list.sites[0]!.counts)
})

/** Twenty-three sites with one machine each, and a machine on no site: twenty-four groups. */
function many(): SiteList {
  const sites: Array<Site> = Array.from({ length: 23 }, (_, index) => {
    const id = `acme_X-${index + 1}_S-1`
    return {
      siteId: `site-${index + 1}`,
      company: "Demo Manufacturing",
      name: `Plant ${index + 1}`,
      machineCount: 1,
      counts: [{ state: "running", machines: 1 }],
      halls: [
        { name: "Hall 1", machines: [placed(id, "running", sending(id, `X-${index + 1}`, "S-1", "P"))] },
        { name: "Hall 2", machines: [] },
      ],
    }
  })
  return { ...list, sites, machineCount: 23, counts: [{ state: "running", machines: 23 }] }
}

test("ten sites to a page, each whole, the machines on no site last; the count names all sites", () => {
  const { groups } = groupsOf(many(), { needs: false, query: "" })
  assert.equal(groups.length, 24)
  const first = pageOf(groups, undefined)
  assert.deepEqual([first.page, first.pages, first.sites, first.groups.length], [1, 3, 23, SITES_PER_PAGE])
  assert.deepEqual(first.groups[0]!.emptyHalls, ["Hall 2"])
  const last = pageOf(groups, 3)
  assert.deepEqual(
    last.groups.map((group) => group.site?.name ?? null),
    ["Plant 21", "Plant 22", "Plant 23", null],
  )
  assert.equal(last.sites, 23)
})

test("a page that does not exist is the nearest that does", () => {
  const { groups } = groupsOf(many(), { needs: false, query: "" })
  assert.equal(pageOf(groups, 99).page, 3)
  assert.equal(pageOf(groups, 0).page, 1)
  assert.equal(pageOf([], 4).page, 1)
  assert.equal(pageOf([], 4).pages, 1)
})

test("up to ten groups make one page", () => {
  const { groups } = groupsOf(list, { needs: false, query: "" })
  assert.equal(pageOf(groups, 2).pages, 1)
  assert.equal(pageOf(groups, 2).page, 1)
})

test("a change of what is shown goes back to page 1", () => {
  type Search = { show?: "needs" | undefined; page?: number | undefined }
  const onPage3: Search = { page: 3 }
  const needsOnPage2: Search = { show: "needs", page: 2 }
  assert.deepEqual(changed(onPage3, { show: "needs" }), { show: "needs", page: undefined })
  assert.deepEqual(changed(needsOnPage2, {}), { show: "needs", page: undefined })
})

test("the address names a page from 2 on and needs you by its word, or nothing", () => {
  assert.equal(pageOfSearch(2), 2)
  assert.equal(pageOfSearch("3"), 3)
  for (const raw of [undefined, 1, "1", 0, -2, 2.5, "x", ""]) assert.equal(pageOfSearch(raw), undefined, String(raw))
  assert.equal(showOf("needs"), "needs")
  for (const raw of [undefined, "all", "Needs", 1]) assert.equal(showOf(raw), undefined, String(raw))
})

test("pressing the chosen item of All or Needs you again keeps what is shown", () => {
  assert.equal(showOfToggle([]), null)
  assert.equal(showOfToggle(["needs"]), "needs")
  assert.equal(showOfToggle(["all"]), undefined)
})

test("an empty list says why: nothing there, nobody needed, or nothing found; only a filter can be cleared", () => {
  assert.deepEqual(emptyOf({ needs: false, query: "" }), {
    title: "No machine yet",
    description: "No machine stands on a site, and none sent a value in the last 24 hours.",
    clearable: false,
  })
  assert.equal(emptyOf({ needs: true, query: "" }).title, "Nobody is needed")
  assert.equal(emptyOf({ needs: true, query: "" }).clearable, true)
  assert.equal(emptyOf({ needs: false, query: "lathe" }).title, "No machine matches")
  assert.equal(emptyOf({ needs: true, query: "lathe" }).title, "No machine matches")
})

test("a machine without a value in the last 24 hours does not lead to its page, one that sends does", () => {
  const { groups } = groupsOf(list, { needs: false, query: "" })
  const rows = groups.flatMap((group) => group.halls.flatMap((hall) => hall.rows))
  assert.deepEqual(
    rows.map((row) => [row.machine.machine, row.linked]),
    [
      [P04, true],
      [M02, true],
      [M09, false],
      [P07, true],
    ],
  )
})

test("a machine is called what it is by its id where its values do not say it, also once it sends again", () => {
  const { groups } = groupsOf(list, { needs: false, query: "" })
  const m09 = groups[1]!.halls[0]!.rows[0]!
  assert.equal(m09.what, "AX-400 M-09")
  // Woken by a message without its identification, as the live list builds it.
  const woken: Machine = { ...unknownMachine(M09), lastValueAt: "2026-11-18T09:29:30.000Z" }
  const sites = list.sites.map((site) =>
    site.siteId !== "south-plant" ? site : { ...site, halls: [{ name: null, machines: [placed(M09, "running", woken)] }] },
  )
  const again = groupsOf({ ...list, sites }, { needs: false, query: "" }).groups[1]!.halls[0]!.rows[0]!
  assert.equal(again.what, "AX-400 M-09")
  assert.equal(again.name, undefined)
  // The name people entered stays the title, and what it is stands below it.
  const lathe = groups[0]!.halls[0]!.rows[0]!
  assert.deepEqual([lathe.name, lathe.what], ["Lathe 4", "AX-400 P-04"])
})
