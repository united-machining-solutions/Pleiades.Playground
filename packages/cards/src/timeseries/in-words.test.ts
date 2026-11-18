import assert from "node:assert/strict"
import { test } from "node:test"

import type { TimeseriesLine } from "./contract.ts"
import { timeseriesLineInWords, timeseriesShowInWords } from "./in-words.ts"
import { signalLabel, tickNumber } from "./words.ts"

const P04 = "alcyone-machines_AX-400_P-04"

const line = (over: Partial<TimeseriesLine>): TimeseriesLine => ({
  machine: P04,
  signal: "activePower",
  path: "umati/Consumption/Electricity/Main/AcActivePowerTotal",
  topic: `machines/${P04}/umati/Consumption/Electricity/Main/AcActivePowerTotal`,
  kind: "number",
  unit: "watt",
  now: { value: 5312.4, at: "2026-11-18T10:00:00.000Z", stale: false },
  low: 1203,
  high: 15726.3,
  values: 720,
  ...over,
})

test("a signal is called as the measurement card calls it, or by its levels", () => {
  assert.equal(signalLabel("umati/Consumption/Electricity/Main/AcActivePowerTotal"), "Active power")
  assert.equal(signalLabel("oem/Spindle/1/BearingTemperature"), "Spindle bearing temperature")
  assert.equal(signalLabel("umati/Channel/1/RapidOverride"), "Channel 1 · Rapid override")
  assert.equal(signalLabel("umati/OperationCounters/PartsProducedInLifetime"), "Operation counters · Parts produced in lifetime")
  assert.equal(signalLabel("oem/Pressure"), "Pressure")
})

test("a line says now, the smallest and the largest value, each in the unit it was published in", () => {
  assert.equal(
    timeseriesLineInWords(line({})),
    `${P04}, active power (umati/Consumption/Electricity/Main/AcActivePowerTotal): now 5,312 W; between 1,203 W and 15,726 W.`,
  )
})

test("a value that is not current, a yes or no and a line without values say so", () => {
  assert.match(timeseriesLineInWords(line({ now: { value: 3, at: "2026-11-18T09:12:00.000Z", stale: true } })), /now 3 W \(last measured at 09:12 UTC, not current\)/)
  assert.equal(
    timeseriesLineInWords(line({ path: "umati/Spindle/1/IsRotating", kind: "yesNo", unit: null, now: { value: true, at: "2026-11-18T09:59:00.000Z", stale: false }, low: null, high: null, values: 4 })),
    `${P04}, spindle rotating (umati/Spindle/1/IsRotating): now yes.`,
  )
  assert.match(timeseriesLineInWords(line({ now: null, low: null, high: null, values: 0 })), /: no value ever; no value in this range\.$/)
})

test("the card in words names its range, then a line for each line", () => {
  const words = timeseriesShowInWords({ from: "2026-11-18T09:00:00.000Z", to: "2026-11-18T10:00:00.000Z", range: "1h", lines: [line({})] })
  assert.match(words, /^Over the last hour, 09:00 UTC to 10:00 UTC:\nalcyone/)
})

test("a tick has the decimals of its unit, or more where the axis steps finer, so no two read the same", () => {
  const ticks = (values: Array<number>, unit: string, step: number) => values.map((value) => tickNumber(value, unit, step))
  // A bearing temperature of 30.02 to 30.11 °C steps by 0.025.
  assert.deepEqual(ticks([30, 30.025, 30.05, 30.075, 30.1], "degreeCelsius", 0.025), ["30.000", "30.025", "30.050", "30.075", "30.100"])
  // A flat 4,000 to 4,002 W steps by 0.5.
  assert.deepEqual(ticks([4_000, 4_000.5, 4_001], "watt", 0.5), ["4,000.0", "4,000.5", "4,001.0"])
  // Where the step is coarser than the unit, the unit decides, as on the measurement card.
  assert.deepEqual(ticks([30, 35], "degreeCelsius", 5), ["30.0", "35.0"])
  assert.deepEqual(ticks([0, 5_000], "watt", 5_000), ["0", "5,000"])
})
