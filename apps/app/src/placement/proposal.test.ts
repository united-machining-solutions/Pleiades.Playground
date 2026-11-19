import assert from "node:assert/strict"
import { test } from "node:test"

import type { PlacedMachine, SiteList, UnplacedMachine } from "@pleiades/cards/site/contract.ts"

import { unknownMachine } from "../live/machines.ts"
import {
  changesNothing,
  checkPlacement,
  closestName,
  countsOf,
  displayNameOf,
  mistypedAs,
  nameToWrite,
  placementInWords,
  proposedPlacement,
} from "./proposal.ts"

const P04 = "alcyone-machines_AX-400_P-04"
const M02 = "merope-microtec_MM-120_M-02"
const P07 = "taygeta-precision_TP-800_P-07"
const L01 = "trumpf_Laser2D_L-01"
const PU01 = "trumpf_Punch_PU-01"
const T01 = "trumpf_Tube_T-01"

function nowOf(machine: string) {
  const [manufacturer, model, serialNumber] = machine.split("_") as [string, string, string]
  const now = unknownMachine(machine)
  return { ...now, identity: { ...now.identity, manufacturer, model, serialNumber }, lastValueAt: "2026-11-19T09:17:00.000Z" }
}

const unplaced = (machine: string): UnplacedMachine => ({ machine, state: "running", now: nowOf(machine) })

const placed = (machine: string, displayName: string | null = null): PlacedMachine => ({
  machine,
  displayName,
  placedAt: "2026-11-18T08:00:00.000Z",
  position: null,
  state: "running",
  now: nowOf(machine),
})

const site = (siteId: string, name: string, halls: Array<[string | null, Array<PlacedMachine>]>) => ({
  siteId,
  company: "Demo Manufacturing",
  name,
  machineCount: halls.reduce((sum, [, machines]) => sum + machines.length, 0),
  counts: [],
  halls: halls.map(([hall, machines]) => ({ name: hall, machines })),
})

const list: SiteList = {
  asOf: "2026-11-19T10:00:00.000Z",
  windowSeconds: 1800,
  source: "Sites API /sites and /placements",
  machineCount: 2,
  counts: [],
  sending: 2,
  needsYou: 0,
  sites: [
    site("north-plant", "North plant", [
      ["Hall 1", [placed(P04, "Lathe 4")]],
      ["Hall 2", [placed(M02)]],
      ["Hall 3", []],
    ]),
    site("south-plant", "South plant", [["Hall A", []]]),
  ],
  unplaced: [unplaced(P07), unplaced(L01), unplaced(PU01), unplaced(T01)],
  sitesError: null,
}

test("machines that sent data and stand on no site are added; the site and the hall are found by name", () => {
  const check = checkPlacement({ machines: [P07, L01], site: "north plant", hall: "hall 2" }, list)
  assert.deepEqual(
    check.machines.map((one) => one.status),
    ["add", "add"],
  )
  assert.deepEqual(check.site, { kind: "existing", siteId: "north-plant", name: "North plant" })
  assert.deepEqual(check.hall, { kind: "existing", name: "Hall 2" })
  assert.deepEqual(countsOf(check), { add: 2, move: 0 })
})

test("a site is found by its id too", () => {
  assert.equal(checkPlacement({ site: "south-plant" }, list).site?.kind, "existing")
})

test("a machine on another site or in another hall moves; one in the place proposed is there already", () => {
  const check = checkPlacement({ machines: [P04, M02], site: "North plant", hall: "Hall 2" }, list)
  const [moving, already] = check.machines
  assert.equal(moving?.status, "move")
  assert.equal(moving?.status === "move" && moving.from, "North plant · Hall 1")
  assert.deepEqual(moving?.status === "move" && moving.fromSpot, { siteId: "north-plant", hall: "Hall 1" })
  assert.equal(already?.status, "already")
})

test("an id that sent nothing is unknown, with the machines it may have been meant for", () => {
  const [one] = checkPlacement({ machines: ["trumpf_Laser2D_L-1"], site: "North plant" }, list).machines
  assert.equal(one?.status, "unknown")
  assert.deepEqual(one?.status === "unknown" && one.meant.map((meant) => meant.machine), [L01])
})

test("a short name that fits one machine is that machine; one that fits several asks", () => {
  const [p07] = checkPlacement({ machines: ["P-07"], site: "North plant" }, list).machines
  assert.equal(p07?.status === "add" && p07.machine, P07)
  const [trumpf] = checkPlacement({ machines: ["TP-800 P-07"], site: "North plant" }, list).machines
  assert.equal(trumpf?.status === "add" && trumpf.machine, P07)
  const ambiguous = checkPlacement({ machines: ["01"], site: "North plant" }, { ...list, unplaced: [unplaced("a_X_01"), unplaced("b_Y_01")] })
  assert.equal(ambiguous.machines[0]?.status, "ambiguous")
})

test("no machine id at all is said so, and a machine named twice counts once", () => {
  const check = checkPlacement({ machines: ["a/b", P07, ` ${P07} `, "P-07"], site: "North plant" }, list)
  assert.deepEqual(
    check.machines.map((one) => one.status),
    ["invalid", "add"],
  )
})

test("a new site takes the company every site has, or the one given; each of its halls is new", () => {
  const check = checkPlacement({ machines: [P07], site: "East plant", hall: "Hall 1" }, list)
  assert.deepEqual(check.site, { kind: "new", name: "East plant", company: "Demo Manufacturing" })
  assert.deepEqual(check.hall, { kind: "new", name: "Hall 1" })
  assert.deepEqual(checkPlacement({ site: "East plant", company: " Acme " }, list).site, { kind: "new", name: "East plant", company: "Acme" })
})

test("a mistyped site is the one of the closest name, a mistyped hall too; a new number is a new hall", () => {
  const check = checkPlacement({ machines: [P07], site: "Nort plant", hall: "Hal 2" }, list)
  assert.deepEqual(check.site, { kind: "guess", siteId: "north-plant", name: "North plant", said: "Nort plant" })
  assert.deepEqual(check.hall, { kind: "guess", name: "Hall 2", said: "Hal 2" })
  assert.deepEqual(checkPlacement({ site: "North plant", hall: "Hall 4" }, list).hall, { kind: "new", name: "Hall 4" })
})

test("a typing error is a word written nearly alike, never another word or another number", () => {
  assert.equal(mistypedAs("Nort plant", "North plant"), true)
  assert.equal(mistypedAs("Northplant", "North plant"), true)
  assert.equal(mistypedAs("South plant", "North plant"), false)
  assert.equal(mistypedAs("Hall 4", "Hall 1"), false)
  assert.equal(mistypedAs("North plant", "North plant"), false)
  assert.equal(closestName("Sout plant", ["North plant", "South plant"]), "South plant")
  assert.equal(closestName("West plant", ["North plant", "South plant"]), undefined)
})

test("the display name stays with one machine only", () => {
  assert.equal(checkPlacement({ machines: [P07], site: "North plant", displayName: " Press 7 " }, list).displayName, "Press 7")
  const two = checkPlacement({ machines: [P07, L01], site: "North plant", displayName: "Press 7" }, list)
  assert.equal(two.displayName, null)
  assert.equal(two.displayNameLeftOut, true)
})

test("a proposal changes nothing where every machine stands there and the site and the hall are there", () => {
  assert.equal(changesNothing(checkPlacement({ machines: [P04], site: "North plant", hall: "Hall 1" }, list)), true)
  assert.equal(changesNothing(checkPlacement({ site: "North plant", hall: "Hall 1" }, list)), true)
  assert.equal(changesNothing(checkPlacement({ site: "North plant", hall: "Hall 4" }, list)), false)
  assert.equal(changesNothing(checkPlacement({ machines: ["x_y_z"], site: "North plant" }, list)), false)
})

test("the words for the model name what the card proposes and every finding", () => {
  const words = placementInWords(checkPlacement({ machines: [P07, P04, "trumpf_Laser2D_L-1"], site: "Nort plant", hall: "Hall 4" }, list))
  assert.match(words, /^The card proposes to add 1 and move 1 machine to North plant · Hall 4\./)
  assert.match(words, /There is no site 'Nort plant'/)
  assert.match(words, /Hall 4 is a new hall of North plant/)
  assert.match(words, /AX-400 P-04 stands on North plant · Hall 1 now and would move/)
  assert.match(words, /trumpf_Laser2D_L-1 sent no data in the last 24 hours\. The card adds it without data/)
  assert.match(words, /A machine with a similar id did: trumpf_Laser2D_L-01\./)
  assert.match(words, /Nothing is written until the person confirms in the card\.$/)
  assert.match(placementInWords(checkPlacement({ site: "East plant", hall: "Hall 1" }, list)), /^The card proposes to create the site East plant with the hall Hall 1\./)
  assert.match(placementInWords(checkPlacement({ site: "North plant", hall: "Hall 4" }, list)), /^The card proposes to add the hall Hall 4 to North plant\./)
})

test("a machine known by a name only is that machine, without data, never another one in its place", () => {
  const check = checkPlacement({ machines: ["MFP 7"], site: "North plant" }, list)
  assert.equal(check.machines.length, 1)
  const [one] = check.machines
  assert.equal(one?.status, "named")
  assert.equal(one?.status === "named" && one.name, "MFP 7")
  assert.equal(check.displayName, "MFP 7")
  assert.equal(changesNothing(check), false)
  const words = placementInWords(check)
  assert.match(words, /No machine MFP 7 sent data; the card asks the person which machine it is\./)
  // A name alike to one that sent is offered, and still not taken.
  const alike = checkPlacement({ machines: ["Laser2D L-1"], site: "North plant" }, list).machines[0]
  assert.equal(alike?.status, "named")
  assert.deepEqual(alike?.status === "named" && alike.meant.map((meant) => meant.machine), [L01])
})

test("without a site the card has none: the person chooses it, or the model asks", () => {
  const check = checkPlacement({ machines: ["MFP 7"] }, list)
  assert.equal(check.site, null)
  assert.equal(check.hall, null)
  assert.equal(changesNothing(check), false)
  assert.match(placementInWords(check), /^The card shows MFP 7 with no place chosen: .* The sites are North plant, South plant\./)
  // One that stands on a site moves, wherever the person puts it.
  assert.equal(checkPlacement({ machines: [P04] }, list).machines[0]?.status, "move")
})

test("the chat reads what the model sent from a result, and nothing from anything else", () => {
  const input = { machines: [P07], site: "North plant" }
  assert.deepEqual(proposedPlacement(JSON.stringify({ input, summary: "…" })), { ...input })
  assert.equal(proposedPlacement(JSON.stringify({ input: { machines: P07 } })), null)
  assert.equal(proposedPlacement("not json"), null)
  assert.equal(proposedPlacement({ input }), null)
})

test("a machine the person described is added under the id made of what it is, or is the machine that sends", () => {
  const described = { name: "MFP 7", manufacturer: "TRUMPF", model: "TruPunch 5000", serialNumber: "A1234" }
  const check = checkPlacement({ machines: [described], site: "North plant", hall: "Hall 2" }, list)
  const [one] = check.machines
  assert.equal(one?.status, "named")
  assert.equal(one?.status === "named" && one.machine, "trumpf_TruPunch-5000_A1234")
  assert.deepEqual(one?.status === "named" && one.identity, { manufacturer: "TRUMPF", model: "TruPunch 5000", serialNumber: "A1234" })
  assert.equal(check.displayName, "MFP 7")
  assert.match(placementInWords(check), /MFP 7 sent no data yet; the card adds it as trumpf_TruPunch-5000_A1234\./)
  // Described as a machine that sends already, it is that machine.
  const sends = checkPlacement({ machines: [{ name: "my laser", manufacturer: "trumpf", model: "Laser2D", serialNumber: "L-01" }], site: "North plant" }, list)
  assert.equal(sends.machines[0]?.status === "add" && sends.machines[0].machine, L01)
})

test("a machine described in part is asked about: what the person said stays, nothing is made up", () => {
  const [one] = checkPlacement({ machines: [{ name: "MFP 20", manufacturer: "Mägerle" }] }, list).machines
  assert.equal(one?.status, "named")
  assert.equal(one?.status === "named" && one.machine, undefined)
  assert.deepEqual(one?.status === "named" && one.identity, { manufacturer: "Mägerle", model: "", serialNumber: "" })
})

test("a name the model split into parts is still looked for whole", () => {
  const [one] = checkPlacement({ machines: [{ name: "2D L-01", manufacturer: "Laser" }] }, list).machines
  assert.equal(one?.status, "named")
  assert.deepEqual(one?.status === "named" && one.meant.map((meant) => meant.machine), [L01])
})

test("a machine that is moved keeps the name people know it by, unless the proposal gives another", () => {
  assert.equal(displayNameOf(list, P04), "Lathe 4")
  assert.equal(displayNameOf(list, M02), null)
  assert.equal(displayNameOf(list, P07), null)
  assert.equal(nameToWrite(undefined, list, P04), "Lathe 4")
  assert.equal(nameToWrite(" ", list, P04), "Lathe 4")
  assert.equal(nameToWrite("Press 4", list, P04), "Press 4")
  assert.equal(nameToWrite(null, list, P07), null)
})

test("a machine on a site is found by its display name", () => {
  const [one] = checkPlacement({ machines: ["Lathe 4"], site: "South plant", hall: "Hall A" }, list).machines
  assert.equal(one?.status === "move" && one.machine, P04)
})
