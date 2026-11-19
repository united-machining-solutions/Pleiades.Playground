import assert from "node:assert/strict"
import { test } from "node:test"

import type { SiteList } from "@pleiades/cards/site/contract.ts"

import {
  MAX_TEXT,
  companyOf,
  followingRequest,
  hallsWith,
  makeHallRequestOf,
  makeSiteRequestOf,
  placeInWords,
  placeRequestOf,
  placementOf,
  placementsOf,
  problemOfId,
  refusalOf,
  removeRequestOf,
  sameSpot,
  sentenceOf,
  siteIdOf,
  siteStepOf,
  undoMadeRequestOf,
  undoRequestOf,
  addedRequestOf,
} from "./placing.ts"

const P07 = "taygeta-precision_TP-800_P-07"

test("an added machine goes on no site, on the only one, or on one a person chooses", () => {
  const north = { siteId: "north-plant", name: "North plant" }
  const south = { siteId: "south-plant", name: "South plant" }
  assert.deepEqual(siteStepOf([]), { kind: "none" })
  assert.deepEqual(siteStepOf([north]), { kind: "one", site: north })
  assert.deepEqual(siteStepOf([north, south]), { kind: "choose", sites: [north, south] })
})

test("an added machine is put on a site by its machine id and the site id", () => {
  assert.deepEqual(addedRequestOf({ machine: P07, siteId: "north-plant", more: 1 }), { machine: P07, siteId: "north-plant" })
  assert.throws(() => addedRequestOf({ machine: "a/b", siteId: "north-plant" }), /machine id/)
  assert.throws(() => addedRequestOf({ machine: P07 }), /site id is required/)
  assert.throws(() => addedRequestOf(undefined), /machine id is required/)
})

test("a machine id or site id is one level of a topic, as the Sites API wants it", () => {
  assert.equal(problemOfId(P07, "machine id"), undefined)
  assert.match(problemOfId("", "machine id")!, /required/)
  assert.match(problemOfId("a/b", "machine id")!, /'\/'/)
  assert.match(problemOfId("a+b", "site id")!, /'\+'/)
  assert.match(problemOfId("50%", "site id")!, /'%'/)
  assert.match(problemOfId(" P-07", "machine id")!, /blank/)
  assert.match(problemOfId(7, "machine id")!, /required/)
})

test("placing on a site that exists keeps the hall as the Sites API keeps it, the name and where Home showed the machine", () => {
  const from = { siteId: "north-plant", hall: " Hall 1" }
  const request = placeRequestOf({ machine: P07, site: { siteId: "north-plant" }, hall: " Hall 2 ", displayName: " Grinder 7 ", from })
  assert.deepEqual(request, {
    machine: P07,
    site: { siteId: "north-plant" },
    hall: " Hall 2 ",
    newHall: false,
    displayName: "Grinder 7",
    from,
  })
})

test("a new hall is a name a person typed: trimmed, and blank is none; a hall that is there is never blank", () => {
  const typed = placeRequestOf({ machine: P07, site: { siteId: "north-plant" }, hall: " Hall 3 ", newHall: true })
  assert.deepEqual([typed.hall, typed.newHall], ["Hall 3", true])
  const blank = placeRequestOf({ machine: P07, site: { siteId: "north-plant" }, hall: "  ", newHall: true, displayName: "" })
  assert.deepEqual([blank.hall, blank.newHall, blank.displayName, blank.from], [null, false, null, null])
  assert.throws(() => placeRequestOf({ machine: P07, site: { siteId: "north-plant" }, hall: "  " }), /has a name/)
  // The hall of a new site is typed too.
  assert.equal(placeRequestOf({ machine: P07, site: { name: "East", company: "Demo" }, hall: " Hall A " }).hall, "Hall A")
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
  assert.throws(() => placeRequestOf({ machine: P07, site: { siteId: "north-plant" }, from: { siteId: "a/b" } }), /site id/)
})

test("a removal names the machine and where Home showed it", () => {
  assert.deepEqual(removeRequestOf({ machine: P07, from: { siteId: "north-plant", hall: null } }), {
    machine: P07,
    from: { siteId: "north-plant", hall: null },
  })
  assert.throws(() => removeRequestOf({ machine: "M+1", from: { siteId: "north-plant" } }), /machine id/)
  assert.throws(() => removeRequestOf({ machine: P07 }), /names where/)
})

test("an undo names where the machine stands now, where it goes back, and what was made", () => {
  const back = { siteId: "north-plant", hall: "Hall 1", displayName: " Grinder 7 " }
  assert.deepEqual(undoRequestOf({ machine: P07, now: null, back, made: {} }), {
    machine: P07,
    now: null,
    back: { siteId: "north-plant", hall: "Hall 1", displayName: "Grinder 7" },
    made: { siteId: undefined, siteEtag: undefined, hall: undefined },
  })
  const made = { siteId: "west-plant", siteEtag: "\"3f1c\"", hall: { siteId: "north-plant", hall: "Hall 3" } }
  assert.deepEqual(undoRequestOf({ machine: P07, now: { siteId: "west-plant", hall: null }, back: null, made }).made, made)
  assert.throws(() => undoRequestOf({ machine: P07, made: { siteId: "a#b" } }), /site id/)
  assert.throws(() => undoRequestOf({ machine: P07, made: { siteId: "west-plant", siteEtag: 7 } }), /entity tag/)
})

test("a machine stands where Home showed it on the same site and in the same hall, or on none", () => {
  assert.equal(sameSpot(null, null), true)
  assert.equal(sameSpot({ siteId: "n", hall: "Hall 1" }, { siteId: "n", hall: "Hall 1" }), true)
  assert.equal(sameSpot({ siteId: "n", hall: "Hall 1" }, { siteId: "n", hall: "Hall 2" }), false)
  assert.equal(sameSpot({ siteId: "n", hall: null }, null), false)
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
  const all = placementsOf(list)
  assert.deepEqual([...all.keys()], ["m-02", "p-04"])
  assert.deepEqual(all.get("m-02"), placementOf(list, "m-02"))
})

test("a place in words, and the company a new site starts with", () => {
  assert.equal(placeInWords("North plant", "Hall 2"), "North plant, Hall 2")
  assert.equal(placeInWords("North plant", null), "North plant")
  assert.equal(companyOf(list), "Demo Manufacturing")
  assert.equal(companyOf({ ...list, sites: [...list.sites, { ...list.sites[1]!, siteId: "x", company: "Other" }] }), "")
  assert.equal(companyOf({ ...list, sites: [] }), "")
})

test("a further machine of one add goes to the site of the first, which is there by then", () => {
  const first = {
    machine: "trumpf_Laser2D_L-01",
    site: { name: "West plant", company: "Demo Manufacturing" },
    hall: "Hall 1",
    newHall: true,
    displayName: null,
    from: null,
  }
  assert.deepEqual(followingRequest({ ...first, machine: "trumpf_Punch_PU-01" }, "west-plant"), {
    ...first,
    machine: "trumpf_Punch_PU-01",
    site: { siteId: "west-plant" },
    newHall: false,
  })
})

test("a site or hall made alone is checked before it goes to the Sites API", () => {
  assert.deepEqual(makeSiteRequestOf({ name: " West plant ", company: "Demo Manufacturing", hall: " " }), {
    name: "West plant",
    company: "Demo Manufacturing",
    hall: null,
  })
  assert.throws(() => makeSiteRequestOf({ name: "West plant", company: " " }), /The company is required/)
  assert.throws(() => makeSiteRequestOf({ name: "x".repeat(MAX_TEXT + 1), company: "Demo" }), /longer than/)
  assert.deepEqual(makeHallRequestOf({ siteId: "north-plant", hall: "Hall 4" }), { siteId: "north-plant", hall: "Hall 4" })
  assert.throws(() => makeHallRequestOf({ siteId: "north/plant", hall: "Hall 4" }), /contains/)
  assert.throws(() => makeHallRequestOf({ siteId: "north-plant", hall: "" }), /The hall is required/)
  assert.deepEqual(undoMadeRequestOf({ siteId: "west-plant", siteEtag: '"1"' }), { siteId: "west-plant", siteEtag: '"1"', hall: undefined })
  assert.deepEqual(undoMadeRequestOf({ made: { siteId: "west-plant" } }), { siteId: "west-plant", siteEtag: undefined, hall: undefined })
  assert.deepEqual(undoMadeRequestOf({ hall: { siteId: "north-plant", hall: "Hall 4" } }), {
    siteId: undefined,
    siteEtag: undefined,
    hall: { siteId: "north-plant", hall: "Hall 4" },
  })
})
