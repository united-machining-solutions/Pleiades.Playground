import assert from "node:assert/strict"
import { test } from "node:test"

import type { Identity } from "@pleiades/cards/machine/contract.ts"

import { layout } from "./floor.ts"
import { clustersOf, settingsOf, stepOf } from "./steps.ts"

const who = (deviceClass: string | null, model: string | null = null): Identity => ({
  manufacturer: null,
  model,
  serialNumber: null,
  deviceClass,
})

test("the device class names the step, in English or German", () => {
  assert.equal(stepOf(who("Sliding headstock lathe"), undefined).id, "turning")
  assert.equal(stepOf(who("Machining centre"), undefined).id, "milling")
  assert.equal(stepOf(who("Cylindrical grinding machine"), undefined).id, "grinding")
  assert.equal(stepOf(who("Grinding machine"), undefined).id, "grinding")
  assert.equal(stepOf(who("Drehmaschine"), undefined).id, "turning")
  assert.equal(stepOf(who("Machining centre"), undefined).source, "deviceClass")
})

test("without a device class the model decides, else there is no step", () => {
  assert.deepEqual(stepOf(who(null, "TruLaser 3030 fiber"), undefined), { id: "cutting", name: "Cutting", source: "model" })
  assert.equal(stepOf(who(null, "TruMatic 1000 fiber"), undefined).id, "cutting")
  assert.equal(stepOf(who(null, "UM3"), undefined).id, "printing")
  assert.deepEqual(stepOf(who(null, "JuiceBar"), undefined), { id: "none", name: "No step", source: "none" })
  assert.equal(stepOf({ manufacturer: null, model: null, serialNumber: null }, undefined).id, "none")
})

test("what a person set wins, also no step", () => {
  assert.deepEqual(stepOf(who("Machining centre"), "grinding"), { id: "grinding", name: "Grinding", source: "person" })
  assert.equal(stepOf(who("Machining centre"), "none").id, "none")
})

test("clusters follow the order of the steps, no step last, machines in the order they came", () => {
  const clusters = clustersOf(
    [
      { machine: "juice", identity: who(null, "JuiceBar") },
      { machine: "p04", identity: who("Cylindrical grinding machine") },
      { machine: "m02", identity: who("Sliding headstock lathe") },
      { machine: "laser", identity: who(null, "TruLaser") },
      { machine: "p07", identity: who("Machining centre") },
      { machine: "osaca", identity: who("Machining centre") },
    ],
    { juice: "joining" },
  )
  assert.deepEqual(
    clusters.map((one) => [one.id, one.machines]),
    [
      ["cutting", ["laser"]],
      ["turning", ["m02"]],
      ["milling", ["p07", "osaca"]],
      ["grinding", ["p04"]],
      ["joining", ["juice"]],
    ],
  )
})

test("a stored setting that is no step is left out", () => {
  assert.deepEqual(settingsOf('{"a":"milling","b":"painting","c":3}'), { a: "milling" })
  assert.deepEqual(settingsOf("not json"), {})
  assert.deepEqual(settingsOf("[1]"), {})
})

test("each cluster has columns of its own, its name above them", () => {
  const { places, clusters } = layout(["a", "b", "c", "d", "e"], [
    { id: "turning", name: "Turning", machines: ["a"] },
    { id: "milling", name: "Milling", machines: ["b", "c", "d", "e"] },
  ])
  const x = (id: string) => places.find((one) => one.id === id)!.x
  assert.ok(x("a") < x("b"))
  assert.equal(x("b"), x("c"))
  assert.ok(x("e") > x("d"))
  assert.deepEqual(
    clusters.map((one) => one.name),
    ["Turning", "Milling"],
  )
  assert.ok(places.every((one) => one.y >= 0))
  assert.ok(places.filter((one) => !one.id.startsWith("concept:")).every((one) => one.y > 0))
})

test("a manufacturer of the UNITED GRINDING Group or TRUMPF has its logo, any other its name", async () => {
  const { makerOf } = await import("./makers.ts")
  assert.equal(makerOf("TRUMPF Werkzeugmaschinen SE + Co. KG")?.logo, "/manufacturers/trumpf.svg")
  assert.equal(makerOf("Fritz Studer AG")?.logo, "/manufacturers/united-grinding.png")
  assert.equal(makerOf("MÄGERLE")?.logo, "/manufacturers/united-grinding.png")
  assert.deepEqual(makerOf("alcyone-machines"), { name: "alcyone-machines", logo: null, height: 0 })
  assert.equal(makerOf("  "), null)
  assert.equal(makerOf(null), null)
})

test("an order is on its way while it runs, is held up or is between two machines", async () => {
  const { phaseOf } = await import("./floor.ts")
  const step = (started: boolean) => ({ result: started ? { start: "2026-11-19T09:00:00Z" } : null })
  const order = (state: string, steps: Array<ReturnType<typeof step>>) => ({ state, steps }) as unknown as Parameters<typeof phaseOf>[0]
  assert.equal(phaseOf(order("running", [step(true)])), "moving")
  assert.equal(phaseOf(order("interrupted", [step(true)])), "moving")
  assert.equal(phaseOf(order("waiting", [step(true), step(false)])), "moving")
  assert.equal(phaseOf(order("waiting", [step(false)])), "waiting")
  assert.equal(phaseOf(order("ended", [step(true)])), "through")
  assert.equal(phaseOf(order("aborted", [step(true)])), "through")
})

test("a machine that welds or bends is no cutting machine, even with a laser or a tube", () => {
  assert.equal(stepOf(who("Laser welding machine"), undefined).id, "joining")
  assert.equal(stepOf(who("Tube bender"), undefined).id, "forming")
  assert.equal(stepOf(who(null, "TubeBend 3000"), undefined).id, "forming")
  assert.equal(stepOf(who(null, "Tube bender TB-60"), undefined).id, "forming")
  assert.equal(stepOf(who(null, "TruLaser Weld 5000"), undefined).id, "joining")
  assert.equal(stepOf(who(null, "Bend5130"), undefined).id, "forming")
  // Cutting stays cutting.
  assert.equal(stepOf(who("Laser cutting machine"), undefined).id, "cutting")
  assert.equal(stepOf(who(null, "TruTube 5000"), undefined).id, "cutting")
})

test("printing is additive or 3D, not every Druck", () => {
  assert.equal(stepOf(who("Die casting machine (Druckguss)"), undefined).id, "none")
  assert.equal(stepOf(who("3D-Drucker"), undefined).id, "printing")
  assert.equal(stepOf(who("Additive manufacturing system"), undefined).id, "printing")
  assert.equal(stepOf(who("3D printer"), undefined).id, "printing")
})

test("a logo only for a manufacturer that is the one it names, not for one with a like word", async () => {
  const { makerOf } = await import("./makers.ts")
  for (const other of ["Jungheinrich AG", "Hans Jung GmbH", "Walter AG", "Blohm + Voss", "Trumpfheller GmbH"]) {
    assert.equal(makerOf(other)?.logo, null, other)
  }
  for (const ours of ["Blohm Jung GmbH", "WALTER Maschinenbau GmbH", "Schaudt Mikrosa GmbH", "Ewag AG", "UNITED GRINDING Group", "Mägerle AG Maschinenfabrik"]) {
    assert.equal(makerOf(ours)?.logo, "/manufacturers/united-grinding.png", ours)
  }
})
