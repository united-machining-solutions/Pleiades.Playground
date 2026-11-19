import assert from "node:assert/strict"
import { test } from "node:test"

import type { UnplacedMachine } from "@pleiades/cards/site/contract.ts"

import { unknownMachine } from "../live/machines.ts"
import { identityInWords, identityOfId, machineIdOf, machineIdPart, makerPartOf, makersOf } from "./machine-id.ts"

const makers = [
  { name: "TRUMPF", part: "trumpf" },
  { name: "Alcyone Machine Works", part: "alcyone-machines" },
]

test("a part of a machine id is written as the binding writes it", () => {
  assert.equal(machineIdPart("TruPunch 5000"), "TruPunch-5000")
  assert.equal(machineIdPart("  A1234 "), "A1234")
  assert.equal(machineIdPart("Müller_X/1"), "Mueller-X-1")
  assert.equal(machineIdPart("Café — 7"), "Cafe-7")
  assert.equal(machineIdPart("--P--04--"), "P-04")
  assert.equal(machineIdPart("x".repeat(70)).length, 64)
  assert.equal(machineIdPart("  "), "")
  assert.equal(machineIdPart("#/+"), "")
})

test("the manufacturers that send are known by the name they give themselves and by the part of their ids", () => {
  const sending = (machine: string, manufacturer: string | null): UnplacedMachine => {
    const now = unknownMachine(machine)
    return { machine, state: "running", now: { ...now, identity: { ...now.identity, manufacturer } } }
  }
  const list = {
    unplaced: [sending("trumpf_Laser2D_L-01", "TRUMPF"), sending("trumpf_Punch_PU-01", null), sending("acme_MFP_7", null)],
    sites: [
      {
        siteId: "north-plant",
        company: "Demo Manufacturing",
        name: "North plant",
        machineCount: 1,
        counts: [],
        halls: [
          {
            name: "Hall 1",
            machines: [{ machine: "alcyone-machines_AX-400_P-04", displayName: null, placedAt: "2026-11-19T08:00:00.000Z", state: "no-data" as const, now: null }],
          },
        ],
      },
    ],
  }
  assert.deepEqual(makersOf(list), [
    { name: "TRUMPF", part: "trumpf" },
    { name: "acme", part: "acme" },
    { name: "alcyone-machines", part: "alcyone-machines" },
  ])
})

test("the manufacturer typed becomes the part of a known one whatever its case, of a web address, or the name in lower case", () => {
  for (const typed of ["TRUMPF", "Trumpf", "trumpf", " trumpf "]) assert.equal(makerPartOf(typed, makers), "trumpf", typed)
  // Without the list of those that send, the case is the same.
  for (const typed of ["TRUMPF", "Trumpf", "trumpf"]) assert.equal(makerPartOf(typed), "trumpf", typed)
  assert.equal(makerPartOf("Alcyone Machine Works", makers), "alcyone-machines")
  assert.equal(makerPartOf("alcyone-machines", makers), "alcyone-machines")
  assert.equal(makerPartOf("acme.com", makers), "acme")
  assert.equal(makerPartOf("https://www.acme.co.uk/machines", makers), "acme-co")
  assert.equal(makerPartOf("Acme Tools", makers), "acme-tools")
  assert.equal(makerPartOf("  ", makers), "")
})

test("the machine id is formed from manufacturer, model and serial number, and only from all three", () => {
  for (const manufacturer of ["TRUMPF", "Trumpf", "trumpf"]) {
    assert.equal(machineIdOf({ manufacturer, model: "TruPunch 5000", serialNumber: "A1234" }, makers), "trumpf_TruPunch-5000_A1234")
  }
  assert.equal(machineIdOf({ manufacturer: "Acme Tools", model: "MFP", serialNumber: "7" }), "acme-tools_MFP_7")
  assert.equal(machineIdOf({ manufacturer: "TRUMPF", model: " ", serialNumber: "A1234" }, makers), undefined)
  assert.equal(machineIdOf({ manufacturer: "", model: "MFP", serialNumber: "7" }, makers), undefined)
  assert.equal(machineIdOf({ manufacturer: "Acme", model: "MFP", serialNumber: "#" }, makers), undefined)
})

test("a machine id gives back what the machine is, and what it is reads in words", () => {
  assert.deepEqual(identityOfId("trumpf_TruPunch-5000_A1234", makers), { manufacturer: "TRUMPF", model: "TruPunch-5000", serialNumber: "A1234" })
  assert.deepEqual(identityOfId("acme_MFP_7", makers), { manufacturer: "acme", model: "MFP", serialNumber: "7" })
  assert.equal(identityOfId("MFP 7", makers), undefined)
  assert.equal(identityOfId("acme__7", makers), undefined)
  assert.equal(identityInWords({ manufacturer: "TRUMPF", model: "TruPunch 5000", serialNumber: "A1234" }), "TRUMPF · TruPunch 5000 · A1234")
  assert.equal(identityInWords({ manufacturer: "TRUMPF", model: " ", serialNumber: "A1234" }), "TRUMPF · A1234")
})
