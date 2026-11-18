import assert from "node:assert/strict"
import { test } from "node:test"

import { timeseriesShowOf } from "./results.ts"

const line = {
  machine: "alcyone-machines_AX-400_P-04",
  signal: "activePower",
  path: "umati/Consumption/Electricity/Main/AcActivePowerTotal",
  topic: "machines/alcyone-machines_AX-400_P-04/umati/Consumption/Electricity/Main/AcActivePowerTotal",
  kind: "number",
  unit: "watt",
  now: { value: 5312.4, at: "2026-11-18T10:00:00.000Z", stale: false },
  low: 1203,
  high: 15726.3,
  values: 720,
}

test("the JSON of genui_timeseries_show becomes the lines of the card", () => {
  const shown = timeseriesShowOf(JSON.stringify({ from: "2026-11-18T09:00:00.000Z", to: "2026-11-18T10:00:00.000Z", range: "1h", lines: [line] }))
  assert.equal(shown?.lines[0]?.high, 15726.3)
})

test("what does not keep the contract of the card is not drawn as one", () => {
  assert.equal(timeseriesShowOf(JSON.stringify({ from: "2026-11-18T09:00:00.000Z", to: "2026-11-18T10:00:00.000Z", range: "2h", lines: [line] })), null)
  assert.equal(timeseriesShowOf("no timeseries"), null)
  assert.equal(timeseriesShowOf(undefined), null)
})
