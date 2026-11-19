import assert from "node:assert/strict"
import { test } from "node:test"

import { QUANTITIES } from "@pleiades/cards/measurement/contract.ts"
import type { MachineMeasurements, MeasurementSeries, Quantity } from "@pleiades/cards/measurement/contract.ts"

import { graphsOf, nowNextToTitle } from "./shown.ts"

const P04 = "alcyone-machines_AX-400_P-04"
const M02 = "merope-microtec_MM-120_M-02"

/** A machine as the backend lists it: every quantity, with null where the machine never published it. */
function machine(id: string, measured: Partial<Record<Quantity, number | boolean>>, silent = false): MachineMeasurements {
  return {
    machine: id,
    measurements: QUANTITIES.map((quantity) => {
      const value = measured[quantity] ?? null
      return { quantity, value, unit: null, at: value === null ? null : "2026-11-16T09:29:58.000Z", stale: silent || value === null, topic: `machines/${id}/${quantity}` }
    }),
  }
}

const graphs: MeasurementSeries["quantities"] = [
  { quantity: "activePower", unit: "watt", lines: [{ machine: P04, topic: "a", values: [1] }] },
  { quantity: "spindleRotating", unit: null, lines: [] },
]

test("with all machines only the graphs with a line are shown, with one machine every graph", () => {
  assert.deepEqual(
    graphsOf(graphs, undefined).map((one) => one.quantity),
    ["activePower"],
  )
  assert.deepEqual(
    graphsOf(graphs, P04).map((one) => one.quantity),
    ["activePower", "spindleRotating"],
  )
  assert.deepEqual(graphsOf([{ quantity: "spindleRotating", unit: null, lines: [] }], undefined), [])
})

test("with all machines the value of now stands next to the title where a single machine has one", () => {
  const current = [machine(P04, { activePower: 3010, bearingTemperature: 41 }), machine(M02, { activePower: 1200 })]
  const shown = [P04, M02]
  // The backend lists the bearing temperature of M-02 too, as null: it does not count.
  assert.deepEqual(
    nowNextToTitle(current, shown, "bearingTemperature", undefined).map((one) => one.machine),
    [P04],
  )
  // Two machines measure the power: the lines speak alone.
  assert.deepEqual(nowNextToTitle(current, shown, "activePower", undefined), [])
  // No machine has a value: nothing stands there.
  assert.deepEqual(nowNextToTitle(current, shown, "feedOverride", undefined), [])
})

test("a value of false is a value", () => {
  const current = [machine(P04, { spindleRotating: false }), machine(M02, {})]
  assert.deepEqual(
    nowNextToTitle(current, [P04, M02], "spindleRotating", undefined).map((one) => one.machine),
    [P04],
  )
})

test("with one machine chosen its values stand next to every title, as before, a missing one too", () => {
  const current = [machine(P04, { activePower: 3010 }), machine(M02, { activePower: 1200 })]
  assert.deepEqual(
    nowNextToTitle(current, [P04], "activePower", P04).map((one) => one.machine),
    [P04],
  )
  assert.deepEqual(
    nowNextToTitle(current, [P04], "feedOverride", P04).map((one) => one.machine),
    [P04],
  )
  // A machine of an old link that is no longer there shows none.
  assert.deepEqual(nowNextToTitle(current, [], "activePower", "gone"), [])
})

test("a machine that went silent does not count next to one that measures now, and stands alone where it is the only one", () => {
  const silent = machine(P04, { activePower: 3010 }, true)
  const measuring = machine(M02, { activePower: 1200 })
  // One measures now, one has an old value: the one of now stands there.
  assert.deepEqual(
    nowNextToTitle([silent, measuring], [P04, M02], "activePower", undefined).map((one) => one.machine),
    [M02],
  )
  // None measures now and one has an old value: it stands there, and the graph marks it as not current.
  assert.deepEqual(
    nowNextToTitle([silent, machine(M02, {})], [P04, M02], "activePower", undefined).map((one) => one.machine),
    [P04],
  )
  // Two old values and none of now: nothing.
  assert.deepEqual(nowNextToTitle([silent, machine(M02, { activePower: 1 }, true)], [P04, M02], "activePower", undefined), [])
})

test("a machine the broker just named, with no measurement yet, counts for nothing", () => {
  const justNamed: MachineMeasurements = { machine: M02, measurements: [] }
  assert.deepEqual(
    nowNextToTitle([machine(P04, { activePower: 3010 }), justNamed], [P04, M02], "activePower", undefined).map((one) => one.machine),
    [P04],
  )
})
