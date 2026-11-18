import assert from "node:assert/strict"
import { test } from "node:test"

import type { TimeseriesLine } from "./contract.ts"
import { timeseriesLineInWords, timeseriesShowInWords } from "./in-words.ts"
import { signalLabel } from "./words.ts"

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
