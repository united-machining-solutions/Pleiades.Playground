import assert from "node:assert/strict"
import { test } from "node:test"

import type { Measurement } from "./contract.ts"
import { energy, measured, percent, power, poweredOn, rotating } from "./tiles.ts"

const one = (quantity: Measurement["quantity"], value: Measurement["value"], unit: string | null): Measurement => ({
  quantity,
  value,
  unit,
  at: "2026-11-18T20:37:00Z",
  stale: false,
  topic: "machines/m/umati/x",
})

test("a tile writes power in kilowatts, the number apart from its unit", () => {
  assert.deepEqual(power({ value: 7_770, unit: "watt" }), { number: "7.77", unit: "kW" })
  assert.deepEqual(power({ value: 12_335, unit: "watt" }), { number: "12.34", unit: "kW" })
})

test("a tile writes energy in kilowatt hours, from the unit of the meter", () => {
  assert.deepEqual(energy(155_700, "wattHour"), { number: "155.7", unit: "kWh" })
  assert.deepEqual(energy(36_000_000, "joule"), { number: "10.0", unit: "kWh" })
})

test("an override is a percent", () => {
  assert.equal(percent({ value: 1.1, unit: "one" }), "110 %")
  assert.equal(percent({ value: 0.95, unit: "one" }), "95 %")
})

test("the spindle rotates or stands, and the hours powered on are hours and minutes", () => {
  assert.equal(rotating({ value: true }), "Rotating")
  assert.equal(rotating({ value: false }), "Stopped")
  assert.equal(poweredOn({ value: 1_834 * 3600 + 60 * 31, unit: "second" }), "1834 h 31 min")
})

test("a value in a unit the tile does not know stays as the measurement card writes it", () => {
  assert.deepEqual(power({ value: 3, unit: "horsepower" }), { number: "3.00", unit: "horsepower" })
  assert.equal(percent({ value: 95, unit: "percent" }), "95.00 percent")
})

test("a quantity without a value is not measured", () => {
  const all = [one("activePower", null, "watt"), one("feedOverride", 1, "one")]
  assert.equal(measured(all, "activePower"), undefined)
  assert.equal(measured(all, "feedOverride")?.value, 1)
  assert.equal(measured(all, "spindleOverride"), undefined)
})
