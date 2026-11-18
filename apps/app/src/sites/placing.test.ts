import assert from "node:assert/strict"
import { test } from "node:test"

import type { SiteList } from "@pleiades/cards/site/contract.ts"

import {
  MAX_TEXT,
  companyOf,
  hallsWith,
  machineIdOf,
  placeInWords,
  placeRequestOf,
  placementOf,
  problemOfId,
  refusalOf,
  sentenceOf,
  siteIdOf,
} from "./placing.ts"

const P07 = "taygeta-precision_TP-800_P-07"

test("a machine id or site id is one level of a topic, as the Sites API wants it", () => {
  assert.equal(problemOfId(P07, "machine id"), undefined)
  assert.match(problemOfId("", "machine id")!, /required/)
  assert.match(problemOfId("a/b", "machine id")!, /'\/'/)
  assert.match(problemOfId("a+b", "site id")!, /'\+'/)
  assert.match(problemOfId("50%", "site id")!, /'%'/)
  assert.match(problemOfId(" P-07", "machine id")!, /blank/)
  assert.match(problemOfId(7, "machine id")!, /required/)
})

test("placing on a site that exists keeps the hall, the name and whether it moves", () => {
  const request = placeRequestOf({ machine: P07, site: { siteId: "north-plant" }, hall: " Hall 2 ", displayName: "Grinder 7", move: true })
  assert.deepEqual(request, {
    machine: P07,
    site: { siteId: "north-plant" },
    hall: "Hall 2",
    newHall: false,
    displayName: "Grinder 7",
    move: true,
  })
})

test("a blank hall or display name is none, and a new hall needs a name", () => {
  const request = placeRequestOf({ machine: P07, site: { siteId: "north-plant" }, hall: "  ", newHall: true, displayName: "" })
  assert.equal(request.hall, null)
  assert.equal(request.newHall, false)
  assert.equal(request.displayName, null)
  assert.equal(request.move, false)
})

test("a new site needs a name and a company", () => {
  assert.deepEqual(placeRequestOf({ machine: P07, site: { name: "East plant", company: "Demo Manufacturing" } }).site, {
    name: "East plant",
    company: "Demo Manufacturing",
  })
  assert.throws(() => placeRequestOf({ machine: P07, site: { name: "East plant", company: " " } }), /company is required/)
  assert.throws(() => placeRequestOf({ machine: P07, site: { name: "", company: "Demo" } }), /name of the site is required/)
})

test("what the dialog sends is refused before it goes anywhere", () => {
  assert.throws(() => placeRequestOf({ machine: "a/b", site: { siteId: "north-plant" } }), /machine id/)
  assert.throws(() => placeRequestOf({ machine: P07, site: { siteId: "north#plant" } }), /site id/)
  assert.throws(() => placeRequestOf({ machine: P07, site: { siteId: "north-plant" }, displayName: "x".repeat(MAX_TEXT + 1) }), /longer than/)
  assert.throws(() => placeRequestOf({ machine: P07, site: { siteId: "north-plant" }, hall: 3 }), /hall is text/)
  assert.throws(() => placeRequestOf(undefined), /machine id is required/)
  assert.equal(machineIdOf(P07), P07)
  assert.throws(() => machineIdOf("M+1"), /machine id/)
})

test("a new site gets its id from its name, and never one that is taken", () => {
  assert.equal(siteIdOf("North plant", new Set()), "north-plant")
  assert.equal(siteIdOf("Zürich Süd", new Set()), "zurich-sud")
  assert.equal(siteIdOf("  Hall #1 / West ", new Set()), "hall-1-west")
  assert.equal(siteIdOf("工場", new Set()), "site")
  assert.equal(siteIdOf("North plant", new Set(["north-plant"])), "north-plant-2")
  assert.equal(siteIdOf("North plant", new Set(["north-plant", "north-plant-2"])), "north-plant-3")
})

test("a new hall comes after the halls of the site, and a hall is never named twice", () => {
  assert.deepEqual(hallsWith(["Hall 1", "Hall 2"], "Hall 3"), ["Hall 1", "Hall 2", "Hall 3"])
  assert.deepEqual(hallsWith(["Hall 1", "Hall 2"], "Hall 2"), ["Hall 1", "Hall 2"])
})

test("a refusal of the API is the sentence it wrote", () => {
  assert.equal(sentenceOf('"There is no site \'x\'."'), "There is no site 'x'.")
  assert.equal(sentenceOf("plain"), "plain")
  assert.equal(sentenceOf('"broken'), '"broken')
  assert.equal(refusalOf(400, '"The site \'north-plant\' has no hall \'Hall 9\'."'), "The site 'north-plant' has no hall 'Hall 9'.")
  assert.equal(refusalOf(409, '"The hall \'Hall 1\' still has machines."'), "The hall 'Hall 1' still has machines.")
  assert.match(refusalOf(403, ""), /sites:write/)
  assert.match(refusalOf(401, ""), /sites:write/)
  assert.equal(refusalOf(500, "boom"), "The Sites API answered 500.")
  assert.equal(refusalOf(400, ""), "The Sites API answered 400.")
})

const list: SiteList = {
  asOf: "2026-11-18T10:00:00.000Z",
  windowSeconds: 86_400,
  source: "Sites API /sites and /placements",
  machineCount: 2,
  counts: [],
  sending: 2,
  needsYou: 0,
  sites: [
    {
      siteId: "north-plant",
      company: "Demo Manufacturing",
      name: "North plant",
      machineCount: 2,
      counts: [],
      halls: [
        { name: "Hall 1", machines: [] },
        {
          name: "Hall 2",
          machines: [{ machine: "m-02", displayName: "Mill 2", placedAt: "2026-11-18T08:00:00.000Z", state: "running", now: null }],
        },
        { name: null, machines: [{ machine: "p-04", displayName: null, placedAt: "2026-11-18T08:00:00.000Z", state: "running", now: null }] },
      ],
    },
    { siteId: "south-plant", company: "Demo Manufacturing", name: "South plant", machineCount: 0, counts: [], halls: [] },
  ],
  unplaced: [],
  sitesError: null,
}

test("where a machine stands is read from the list Home has", () => {
  assert.deepEqual(placementOf(list, "m-02"), { siteId: "north-plant", siteName: "North plant", hall: "Hall 2", displayName: "Mill 2" })
  assert.deepEqual(placementOf(list, "p-04"), { siteId: "north-plant", siteName: "North plant", hall: null, displayName: null })
  assert.equal(placementOf(list, P07), undefined)
})

test("a place in words, and the company a new site starts with", () => {
  assert.equal(placeInWords("North plant", "Hall 2"), "North plant, Hall 2")
  assert.equal(placeInWords("North plant", null), "North plant")
  assert.equal(companyOf(list), "Demo Manufacturing")
  assert.equal(companyOf({ ...list, sites: [...list.sites, { ...list.sites[1]!, siteId: "x", company: "Other" }] }), "")
  assert.equal(companyOf({ ...list, sites: [] }), "")
})
