import assert from "node:assert/strict"
import { test } from "node:test"

import type { SiteList, UnplacedMachine } from "@pleiades/cards/site/contract.ts"

import { unknownMachine } from "../live/machines.ts"
import { NAMED, namesInWords, namesOf, typedMachineOf, unplacedInWords } from "./unplaced.ts"

const P07 = "taygeta-precision_TP-800_P-07"
const L01 = "trumpf_Laser2D_L-01"
const PU01 = "trumpf_Punch_PU-01"
const T01 = "trumpf_Tube_T-01"
const P04 = "alcyone-machines_AX-400_P-04"

const unplaced = (machine: string): UnplacedMachine => ({ machine, state: "running", now: unknownMachine(machine) })

const list: SiteList = {
  asOf: "2026-11-18T10:00:00.000Z",
  windowSeconds: 86_400,
  source: "Sites API /sites and /placements",
  machineCount: 1,
  counts: [{ state: "running", machines: 1 }],
  sending: 1,
  needsYou: 0,
  sites: [
    {
      siteId: "north-plant",
      company: "Demo Manufacturing",
      name: "North plant",
      machineCount: 1,
      counts: [{ state: "running", machines: 1 }],
      halls: [{ name: "Hall 1", machines: [{ machine: P04, displayName: "Lathe 4", placedAt: "2026-11-18T08:00:00.000Z", state: "running", now: null }] }],
    },
  ],
  unplaced: [unplaced(P07), unplaced(L01)],
  sitesError: null,
}

test("a few machines by name, then how many more", () => {
  assert.equal(NAMED, 3)
  assert.equal(namesInWords([]), "")
  assert.equal(namesInWords(["TP-800 P-07"]), "TP-800 P-07")
  assert.equal(namesInWords(["A", "B", "C"]), "A, B, C")
  assert.equal(namesInWords(["A", "B", "C", "D", "E"]), "A, B, C +2")
  assert.equal(namesInWords(["A", "B", "C"], 1), "A +2")
})

test("a machine on no site is named by what it is, as its row would be", () => {
  assert.deepEqual(namesOf([unplaced(P07), unplaced(L01)]), ["TP-800 P-07", "Laser2D L-01"])
})

test("the bar says how many machines send and stand on no site, and names a few", () => {
  assert.deepEqual(unplacedInWords([unplaced(P07)]), { title: "1 machine sends data but is not on a site yet:", names: "TP-800 P-07" })
  assert.deepEqual(unplacedInWords([P07, L01, PU01, T01].map(unplaced)), {
    title: "4 machines send data but are not on a site yet:",
    names: "TP-800 P-07, Laser2D L-01, Punch PU-01 +1",
  })
})

test("a machine id a person typed: on a site already, sending, unknown, or no id", () => {
  assert.deepEqual(typedMachineOf(list, P04), { kind: "placed", siteName: "North plant" })
  assert.deepEqual(typedMachineOf(list, L01), { kind: "sending", machine: unplaced(L01) })
  assert.deepEqual(typedMachineOf(list, "alcyone-machines_AX-400_M-09"), { kind: "unknown" })
  const invalid = typedMachineOf(list, "a/b")
  assert.equal(invalid.kind, "invalid")
  assert.match(invalid.kind === "invalid" ? invalid.problem : "", /'\/'/)
  assert.equal(typedMachineOf(list, "").kind, "invalid")
})
