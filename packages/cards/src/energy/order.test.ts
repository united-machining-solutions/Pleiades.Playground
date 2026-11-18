import assert from "node:assert/strict"
import { test } from "node:test"

import type { MachineEnergy } from "./contract.ts"
import { MACHINES_PER_PAGE, ordered, pageLinks, pageOf } from "./order.ts"

/** A machine with an energy in a unit, and a mean and a peak power in watt. */
const machine = (id: string, value: number | null, unit: string | null, meanWatt: number | null, peakWatt: number | null): MachineEnergy => ({
  machine: id,
  energy: { value, unit, start: null, end: null, meterWentBack: false, topic: `machines/${id}/umati/Consumption/Electricity/Main/AcActiveEnergyTotalImportHp` },
  power: { meanWatt, peakWatt, values: meanWatt === null ? 0 : 100, unit: meanWatt === null ? null : "watt", error: null, topic: `machines/${id}/umati/Consumption/Electricity/Main/AcActivePowerTotal` },
})

// The order of the backend: watt hours first, then joule, then unknown. 2 kWh in watt hours,
// 3 kWh and 0.5 kWh in joule.
const result = [
  machine("b-2", 2_000, "wattHour", 4_000, 9_000),
  machine("a-1", 1_000, "wattHour", 6_000, 7_000),
  machine("P-04", 10_800_000, "joule", 5_000, 5_600),
  machine("P-07", 1_800_000, "joule", null, null),
  machine("x-9", null, null, 3_000, 12_000),
]

test("energy compares kilowatt hours over both units, the most first, an unknown energy last", () => {
  assert.deepEqual(ordered(result, "energy").map((one) => one.machine), ["P-04", "b-2", "a-1", "P-07", "x-9"])
})

test("mean and peak power, the largest first, a machine without power last", () => {
  assert.deepEqual(ordered(result, "mean").map((one) => one.machine), ["a-1", "P-04", "b-2", "x-9", "P-07"])
  assert.deepEqual(ordered(result, "peak").map((one) => one.machine), ["x-9", "b-2", "a-1", "P-04", "P-07"])
})

test("by name, the machine ids from A to Z", () => {
  assert.deepEqual(ordered(result, "name").map((one) => one.machine), ["a-1", "b-2", "P-04", "P-07", "x-9"])
})

test("the order leaves the result as it was", () => {
  ordered(result, "name")
  assert.deepEqual(result.map((one) => one.machine), ["b-2", "a-1", "P-04", "P-07", "x-9"])
})

test("pages of five: where a page lies among all, and a page beyond the last shows the last", () => {
  const twelve = Array.from({ length: 12 }, (_, index) => machine(`m-${String(index).padStart(2, "0")}`, (12 - index) * 1_000, "wattHour", 1_000, 2_000))
  assert.equal(MACHINES_PER_PAGE, 5)
  const second = pageOf(twelve, "energy", 2)
  assert.deepEqual(second.machines.map((one) => one.machine), ["m-05", "m-06", "m-07", "m-08", "m-09"])
  assert.deepEqual([second.page, second.pages, second.first, second.last, second.total], [2, 3, 6, 10, 12])
  const third = pageOf(twelve, "energy", 3)
  assert.deepEqual([third.first, third.last, third.machines.length], [11, 12, 2])
  assert.equal(pageOf(twelve, "energy", 9).page, 3)
  assert.equal(pageOf(twelve, "energy", 0).page, 1)
  assert.deepEqual(pageOf(result, "energy", 1).pages, 1)
  assert.deepEqual(pageOf([], "energy", 1), { machines: [], page: 1, pages: 1, first: 0, last: 0, total: 0 })
})

test("many pages: the first, the current one with its neighbours, the last, and a gap between", () => {
  assert.deepEqual(pageLinks(12, 24), [1, "gap", 11, 12, 13, "gap", 24])
  assert.deepEqual(pageLinks(1, 24), [1, 2, "gap", 24])
  assert.deepEqual(pageLinks(24, 24), [1, "gap", 23, 24])
  // A gap of one page shows that page instead.
  assert.deepEqual(pageLinks(3, 24), [1, 2, 3, 4, "gap", 24])
  assert.deepEqual(pageLinks(2, 3), [1, 2, 3])
})

test("where the card is narrow, the pagination leaves out the neighbours of the current page", () => {
  assert.deepEqual(pageLinks(6, 12, 0), [1, "gap", 6, "gap", 12])
  assert.deepEqual(pageLinks(1, 12, 0), [1, "gap", 12])
  assert.deepEqual(pageLinks(2, 12, 0), [1, 2, "gap", 12])
  assert.deepEqual(pageLinks(3, 5, 0), [1, 2, 3, 4, 5])
})
