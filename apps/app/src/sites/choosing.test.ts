import assert from "node:assert/strict"
import { test } from "node:test"

import type { UnplacedMachine } from "@pleiades/cards/site/contract.ts"

import { unknownMachine } from "../live/machines.ts"
import {
  MACHINES_A_PAGE,
  MEANT_AT_MOST,
  NO_HALL,
  addInWords,
  addOneInWords,
  addStartOf,
  addedInWords,
  candidateById,
  candidatesOf,
  choiceOfAll,
  chosenWithAll,
  editDistance,
  fieldsOf,
  fromOf,
  isMachineId,
  knownMachineOf,
  madeInWords,
  makeInWords,
  matches,
  meantBy,
  pickerPageOf,
  placedCandidatesOf,
  siteChoicesOf,
  startMachinesOf,
  startPlaceOf,
  standsAt,
  whereInWords,
  whereOf,
} from "./choosing.ts"

const P07 = "taygeta-precision_TP-800_P-07"
const L01 = "trumpf_Laser2D_L-01"
const PU01 = "trumpf_Punch_PU-01"
const T01 = "trumpf_Tube_T-01"

function unplaced(machine: string, manufacturer: string, model: string, serialNumber: string, state: UnplacedMachine["state"]): UnplacedMachine {
  const now = unknownMachine(machine)
  return {
    machine,
    state,
    now: { ...now, identity: { ...now.identity, manufacturer, model, serialNumber }, lastValueAt: "2026-11-19T09:17:00.000Z" },
  }
}

const list = {
  unplaced: [
    unplaced(P07, "Taygeta Precision", "TP-800", "P-07", "running"),
    unplaced(L01, "TRUMPF", "Laser2D", "L-01", "stopped"),
    unplaced(PU01, "TRUMPF", "Punch", "PU-01", "stopped"),
    unplaced(T01, "TRUMPF", "Tube", "T-01", "stopped"),
  ],
}
const candidates = candidatesOf(list)

test("a machine to add is told apart by what it is, its manufacturer, its state and when it last sent", () => {
  assert.deepEqual(candidates[1], {
    machine: L01,
    what: "Laser2D L-01",
    manufacturer: "TRUMPF",
    state: "stopped",
    lastValueAt: "2026-11-19T09:17:00.000Z",
    byId: false,
    standsOn: null,
  })
  assert.deepEqual(
    candidates.map((one) => one.machine),
    [P07, L01, PU01, T01],
  )
})

test("a machine without an identification takes its manufacturer and what it is from its id", () => {
  const [bare] = candidatesOf({ unplaced: [{ machine: L01, state: "running", now: unknownMachine(L01) }] })
  assert.equal(bare!.what, "Laser2D L-01")
  assert.equal(bare!.manufacturer, "trumpf")
})

test("a machine named by its id sent no data", () => {
  assert.deepEqual(candidateById("trumpf_Laser2D_L-1"), {
    machine: "trumpf_Laser2D_L-1",
    what: "Laser2D L-1",
    manufacturer: "trumpf",
    state: "no-data",
    lastValueAt: null,
    byId: true,
    standsOn: null,
  })
  assert.equal(candidateById("lathe").manufacturer, "")
})

test("a search finds a machine by any of its fields, every word somewhere, without regard to case", () => {
  const found = (query: string) => candidates.filter((one) => matches(fieldsOf(one, "last data 10:17"), query)).map((one) => one.machine)
  assert.deepEqual(found(""), [P07, L01, PU01, T01])
  assert.deepEqual(found("trumpf"), [L01, PU01, T01])
  assert.deepEqual(found("RUNNING"), [P07])
  assert.deepEqual(found("trumpf stopped tube"), [T01])
  assert.deepEqual(found("taygeta-precision_TP"), [P07])
  assert.deepEqual(found("10:17"), [P07, L01, PU01, T01])
  assert.deepEqual(found("lathe"), [])
})

test("only three parts joined by _ are a machine id", () => {
  assert.equal(isMachineId("trumpf_Laser2D_L-1"), true)
  assert.equal(isMachineId("laser"), false)
  assert.equal(isMachineId("trumpf_Laser2D"), false)
  assert.equal(isMachineId("trumpf__L-1"), false)
  assert.equal(isMachineId("trumpf_Laser 2D_L-1"), false)
  assert.equal(isMachineId("trumpf_Laser2D_L#1"), false)
})

test("the edit distance counts the letters that change", () => {
  assert.equal(editDistance("", ""), 0)
  assert.equal(editDistance("l-01", "l-1"), 1)
  assert.equal(editDistance("kitten", "sitting"), 3)
})

test("a mistyped id is offered the machines it is close to, the closest first", () => {
  assert.deepEqual(
    meantBy("trumpf_Laser2D_L-1", candidates).map((one) => one.machine),
    [L01],
  )
  assert.deepEqual(
    meantBy("laser2d l1", candidates).map((one) => one.machine),
    [L01],
  )
  assert.deepEqual(
    meantBy("taygeta_TP-800_P-07", candidates).map((one) => one.machine),
    [P07],
  )
})

test("nothing is offered for a query unlike every machine, or an empty one", () => {
  assert.deepEqual(meantBy("alcyone-machines_AX-400_Q-11", candidates), [])
  assert.deepEqual(meantBy("  ", candidates), [])
})

test("only a near machine is offered: one typing error, the same manufacturer; a short name or one letter in common is none", () => {
  const meant = (query: string) => meantBy(query, candidates).map((one) => one.machine)
  // Near: one typing error in what the machine is, with or without its manufacturer, or in its id.
  assert.deepEqual(meant("Laser 2D L1"), [L01])
  assert.deepEqual(meant("TRUMPF Laser2D L-1"), [L01])
  assert.deepEqual(meant("Punch PU-1"), [PU01])
  assert.deepEqual(meant("trumpf_Tube_T-02"), [T01])
  assert.deepEqual(meant("trumpf_Lazer2D_L-01"), [L01])
  // Not near: another name, another manufacturer, two errors, a short text.
  assert.deepEqual(meant("MFP 7"), [])
  assert.deepEqual(meant("TruPunch 5000"), [])
  assert.deepEqual(meant("acme_MFP_7"), [])
  assert.deepEqual(meant("acme_Laser2D_L-01"), [])
  assert.deepEqual(meant("trumpf_Laser3D_L-02"), [])
  assert.deepEqual(meant("Tube T-12"), [])
  assert.deepEqual(meant("L1"), [])
  assert.deepEqual(meant("PU"), [])
})

test("at most a few machines are offered, of two as alike the one listed first", () => {
  const many = candidatesOf({
    unplaced: ["A-01", "A-02", "A-03", "A-04", "A-05"].map((serial) => unplaced(`trumpf_Tube_${serial}`, "TRUMPF", "Tube", serial, "running")),
  })
  const meant = meantBy("trumpf_Tube_A-00", many)
  assert.equal(meant.length, MEANT_AT_MOST)
  assert.deepEqual(
    meant.map((one) => one.machine),
    ["trumpf_Tube_A-01", "trumpf_Tube_A-02", "trumpf_Tube_A-03"],
  )
})

test("the button says how many machines go where", () => {
  assert.equal(addInWords(0, "North plant"), "Add machines")
  assert.equal(addInWords(1, null), "Add 1 machine")
  assert.equal(addInWords(2, whereInWords("North plant", "Hall 1")), "Add 2 machines to North plant · Hall 1")
  assert.equal(addInWords(4, whereInWords("South plant", null)), "Add 4 machines to South plant")
  assert.equal(addInWords(4, "North plant", 1), "Add 3 and move 1 to North plant")
  assert.equal(addInWords(1, "South plant", 1), "Move 1 machine to South plant")
  assert.equal(addInWords(2, null, 2), "Move 2 machines")
  assert.equal(addInWords(2, "Hall 1", 0, "West plant"), "Create West plant and add 2 machines to Hall 1")
  assert.equal(addInWords(2, null, 1, "West plant"), "Create West plant and add 1 and move 1")
})

test("a machine to move that stands at the place chosen has nothing to do", () => {
  const there = { standsOn: { siteId: "north-plant", siteName: "North plant", hall: "Hall 1" } }
  assert.equal(standsAt(there, north, { name: "Hall 1", made: false }), true)
  assert.equal(standsAt(there, north, NO_HALL), false)
  assert.equal(standsAt(there, south, { name: "Hall 1", made: false }), false)
  assert.equal(standsAt(there, null, NO_HALL), false)
  assert.equal(standsAt({ standsOn: null }, north, { name: "Hall 1", made: false }), false)
})

test("the sites to choose have their halls, the machines of no hall aside", () => {
  const sites = siteChoicesOf({
    sites: [
      {
        siteId: "north-plant",
        company: "Demo Manufacturing",
        name: "North plant",
        machineCount: 0,
        counts: [],
        halls: [
          { name: "Hall 1", machines: [] },
          { name: null, machines: [] },
        ],
      },
    ],
  })
  assert.deepEqual(sites, [{ siteId: "north-plant", name: "North plant", halls: ["Hall 1"] }])
})

test("a site of the list goes by its id, a new one by its name and company, with its hall", () => {
  assert.deepEqual(whereOf({ siteId: "north-plant", name: "North plant", halls: ["Hall 1"] }, { name: "Hall 1", made: false }, "x"), {
    site: { siteId: "north-plant" },
    hall: "Hall 1",
    newHall: false,
  })
  assert.deepEqual(whereOf({ siteId: null, name: "West plant", halls: [] }, { name: "Hall 4", made: true }, " Demo Manufacturing "), {
    site: { name: "West plant", company: "Demo Manufacturing" },
    hall: "Hall 4",
    newHall: true,
  })
  assert.deepEqual(whereOf({ siteId: "north-plant", name: "North plant", halls: [] }, NO_HALL, ""), {
    site: { siteId: "north-plant" },
    hall: null,
    newHall: false,
  })
})

test("the toast names the machine and where it went, or how many went and a few of them", () => {
  assert.deepEqual(addedInWords(["Lathe 4"], [], "North plant", "Hall 1"), { title: "Lathe 4 added · North plant, Hall 1", description: undefined })
  assert.deepEqual(addedInWords([], ["Lathe 4"], "South plant", null), { title: "Lathe 4 moved · South plant", description: undefined })
  assert.deepEqual(addedInWords(["TP-800 P-07", "Laser2D L-01", "Punch PU-01", "Tube T-01"], [], "North plant", "Hall 1"), {
    title: "4 machines added · North plant, Hall 1",
    description: "TP-800 P-07, Laser2D L-01, Punch PU-01 +1",
  })
  assert.deepEqual(addedInWords(["TP-800 P-07", "Laser2D L-01"], ["Lathe 4"], "North plant", null), {
    title: "2 machines added, 1 moved · North plant",
    description: "TP-800 P-07, Laser2D L-01, Lathe 4",
  })
  assert.equal(addedInWords([], ["Lathe 4", "Lathe 11"], "South plant", null).title, "2 machines moved · South plant")
})

const north = { siteId: "north-plant", name: "North plant", halls: ["Hall 1", "Hall 2"] }
const south = { siteId: "south-plant", name: "South plant", halls: ["Hall A"] }

test("a form starts at the place used last, a hall of it only while the site has it", () => {
  assert.deepEqual(startPlaceOf(undefined, [north, south], null), { site: null, hall: NO_HALL })
  assert.deepEqual(startPlaceOf(undefined, [north, south], { siteId: "north-plant", hall: "Hall 2" }), {
    site: north,
    hall: { name: "Hall 2", made: false },
  })
  assert.deepEqual(startPlaceOf(undefined, [north, south], { siteId: "north-plant", hall: "Hall 9" }), { site: north, hall: NO_HALL })
  assert.deepEqual(startPlaceOf(undefined, [north], { siteId: "gone", hall: null }), { site: null, hall: NO_HALL })
})

test("a form handed a site and hall starts there, and makes what the list does not have", () => {
  const last = { siteId: "south-plant", hall: "Hall A" }
  assert.deepEqual(startPlaceOf({ site: { siteId: "north-plant" }, hall: "hall 1" }, [north, south], last), {
    site: north,
    hall: { name: "Hall 1", made: false },
  })
  assert.deepEqual(startPlaceOf({ site: { name: "north plant" } }, [north, south], last), { site: north, hall: NO_HALL })
  assert.deepEqual(startPlaceOf({ site: { name: " West plant " }, hall: "Hall 4" }, [north, south], last), {
    site: { siteId: null, name: "West plant", halls: [] },
    hall: { name: "Hall 4", made: true },
  })
  assert.deepEqual(startPlaceOf({ site: { siteId: "gone" }, hall: "Hall 1" }, [north], last), { site: null, hall: NO_HALL })
  assert.deepEqual(startPlaceOf({ site: { name: "" } }, [north], last), { site: null, hall: NO_HALL })
})

const P04 = "alcyone-machines_AX-400_P-04"
const placedList = {
  sites: [
    {
      siteId: "north-plant",
      company: "Demo Manufacturing",
      name: "North plant",
      machineCount: 1,
      counts: [],
      halls: [{ name: "Hall 1", machines: [{ machine: P04, displayName: "Lathe 4", placedAt: "2026-11-19T08:00:00.000Z", state: "stopped" as const, now: null }] }],
    },
  ],
}

test("a machine on a site is one to move, with where it stands now", () => {
  const placed = placedCandidatesOf(placedList)
  assert.deepEqual(placed.get(P04), {
    machine: P04,
    what: "Lathe 4",
    manufacturer: "alcyone-machines",
    state: "stopped",
    lastValueAt: null,
    byId: false,
    standsOn: { siteId: "north-plant", siteName: "North plant", hall: "Hall 1" },
  })
  assert.deepEqual(fromOf(placed.get(P04)!), { siteId: "north-plant", hall: "Hall 1" })
  assert.equal(fromOf(candidates[0]!), null)
})

test("a form handed machines starts with them chosen: of the list, on a site to move, and an unknown id without data", () => {
  const started = startMachinesOf({ machines: [L01, "trumpf_Laser2D_L-9", P04, "bad#id", L01] }, candidates, placedCandidatesOf(placedList))
  assert.deepEqual([...started.chosen], [L01, "trumpf_Laser2D_L-9", P04])
  assert.deepEqual(
    started.more.map((one) => [one.machine, one.byId, one.standsOn?.siteId ?? null]),
    [
      ["trumpf_Laser2D_L-9", true, null],
      [P04, false, "north-plant"],
    ],
  )
  assert.deepEqual(startMachinesOf(undefined, candidates, new Map()), { chosen: new Set(), more: [] })
})

test("the button of making alone names the site or hall it makes, and nothing where all is there", () => {
  assert.equal(makeInWords({ siteId: null, name: "South plant", halls: [] }, { name: "Hall 1", made: true }), "Create site South plant with Hall 1")
  assert.equal(makeInWords({ siteId: null, name: "West plant", halls: [] }, NO_HALL), "Create site West plant")
  assert.equal(makeInWords(north, { name: "Hall 4", made: true }), "Add Hall 4 to North plant")
  assert.equal(makeInWords(north, { name: "Hall 1", made: false }), null)
  assert.equal(makeInWords(north, NO_HALL), null)
  assert.equal(makeInWords(null, NO_HALL), null)
})

test("the toast of making alone", () => {
  assert.equal(madeInWords("South plant", "Hall 1", true), "South plant created, with Hall 1")
  assert.equal(madeInWords("West plant", null, true), "West plant created")
  assert.equal(madeInWords("North plant", "Hall 4", false), "Hall 4 added to North plant")
})

test("the list shows seven machines a page; a search looks in all of them, and choosing all takes every page", () => {
  const twelve = candidatesOf({
    unplaced: Array.from({ length: 12 }, (_, index) => {
      const serial = `T-${String(index + 1).padStart(2, "0")}`
      return unplaced(`trumpf_Tube_${serial}`, "TRUMPF", "Tube", serial, index < 9 ? "stopped" : "running")
    }),
  })
  assert.equal(MACHINES_A_PAGE, 7)
  const first = pickerPageOf(twelve, 1)
  assert.deepEqual([first.items.length, first.page, first.pages, first.start], [7, 1, 2, 0])
  const second = pickerPageOf(twelve, 2)
  assert.deepEqual(
    second.items.map((one) => one.what),
    ["Tube T-08", "Tube T-09", "Tube T-10", "Tube T-11", "Tube T-12"],
  )
  assert.equal(pickerPageOf(twelve, 9).page, 2)

  // A search finds on every page, and its machines start again at page 1.
  const found = twelve.filter((one) => matches(fieldsOf(one), "running"))
  assert.deepEqual(
    found.map((one) => one.what),
    ["Tube T-10", "Tube T-11", "Tube T-12"],
  )
  assert.deepEqual([pickerPageOf(found, 1).items.length, pickerPageOf(found, 1).pages], [3, 1])

  // "Choose all" takes all found, those on the page not shown too; the head says all, some or none.
  assert.equal(choiceOfAll(twelve, new Set()), "none")
  const all = chosenWithAll(new Set(), twelve, true)
  assert.equal(all.size, 12)
  assert.equal(choiceOfAll(twelve, all), "all")
  const some = chosenWithAll(all, found, false)
  assert.equal(some.size, 9)
  assert.equal(choiceOfAll(twelve, some), "some")
  assert.equal(choiceOfAll(found, some), "none")
  assert.deepEqual([...chosenWithAll(new Set(["other"]), found, true)], ["other", ...found.map((one) => one.machine)])
})

test("a form handed no place starts without one, and does not take the place used last", () => {
  assert.deepEqual(startPlaceOf({ site: null }, [north, south], { siteId: "north-plant", hall: "Hall 1" }), { site: null, hall: NO_HALL })
  assert.deepEqual(startPlaceOf({ site: null, hall: "Hall 1" }, [north], null), { site: null, hall: NO_HALL })
})

const makers = [
  { name: "TRUMPF", part: "trumpf" },
  { name: "Alcyone Machine Works", part: "alcyone-machines" },
]

test("\"Add a new machine\" starts with what is known of the machine named, or an id handed in, split", () => {
  const none = { manufacturer: "", model: "", serialNumber: "" }
  assert.deepEqual(addStartOf(undefined, makers), { identity: none, name: "" })
  assert.deepEqual(addStartOf({ named: [{ name: " MFP 7 ", meant: [], manufacturer: "Trumpf", model: "TruPunch 5000", serialNumber: "A1234" }] }, makers), {
    identity: { manufacturer: "Trumpf", model: "TruPunch 5000", serialNumber: "A1234" },
    name: "MFP 7",
  })
  assert.deepEqual(addStartOf({ named: [{ name: "MFP 7", meant: [], machine: "trumpf_TruPunch-5000_A1234" }] }, makers), {
    identity: { manufacturer: "TRUMPF", model: "TruPunch-5000", serialNumber: "A1234" },
    name: "MFP 7",
  })
  assert.deepEqual(addStartOf({ named: [{ name: "MFP 7", meant: [] }] }, makers), { identity: none, name: "MFP 7" })
  assert.deepEqual(addStartOf({ machines: ["acme_MFP_7"] }, makers), { identity: { manufacturer: "acme", model: "MFP", serialNumber: "7" }, name: "" })
  assert.deepEqual(addStartOf({ machines: ["mfp7"] }, makers), { identity: none, name: "" })
})

test("a new machine is checked by its id alone: one that sends, one on a site, or a new one", () => {
  const placed = placedCandidatesOf(placedList)
  assert.deepEqual(knownMachineOf(undefined, candidates, placed), { kind: "new" })
  assert.deepEqual(knownMachineOf("acme_MFP_7", candidates, placed), { kind: "new" })
  const sends = knownMachineOf(L01, candidates, placed)
  assert.deepEqual([sends.kind, sends.kind === "sends" && sends.candidate.machine], ["sends", L01])
  const onSite = knownMachineOf(P04, candidates, placed)
  assert.deepEqual([onSite.kind, onSite.kind === "placed" && onSite.candidate.standsOn?.siteName], ["placed", "North plant"])
  // Only the exact id counts: one letter off is a new machine.
  assert.deepEqual(knownMachineOf("trumpf_Laser2D_L-1", candidates, placed), { kind: "new" })
})

test("the buttons say what is done to how many machines, and where", () => {
  assert.equal(addInWords(4, "North plant · Hall 1", 0, null, "Assign"), "Assign 4 machines to North plant · Hall 1")
  assert.equal(addInWords(0, null, 0, null, "Assign"), "Assign machines")
  assert.equal(addInWords(3, "North plant", 1, null, "Assign"), "Assign 2 and move 1 to North plant")
  assert.equal(addInWords(2, "Hall 1", 0, "West plant", "Assign"), "Create West plant and assign 2 machines to Hall 1")
  assert.equal(addOneInWords("MFP 7", "North plant · Hall 2", false), "Add MFP 7 to North plant · Hall 2")
  assert.equal(addOneInWords("Lathe 4", "South plant", true), "Move Lathe 4 to South plant")
  assert.equal(addOneInWords("MFP 7", "Hall 1", false, "West plant"), "Create West plant and add MFP 7 to Hall 1")
  assert.equal(addOneInWords(" ", null, false), "Add machine")
})
