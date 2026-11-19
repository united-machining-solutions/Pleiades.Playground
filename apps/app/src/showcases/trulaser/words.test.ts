import assert from "node:assert/strict"
import { test } from "node:test"

import type { Signal } from "./contract.ts"
import { shownNumber, tileValue } from "./words.ts"

test("a display writes a fraction as percent and a pressure in pascal as millibar", () => {
  assert.deepEqual(shownNumber(0.85, "one", "percent"), { number: "85.0", unit: "%" })
  assert.deepEqual(shownNumber(513000, "pascal", "millibar"), { number: "5130.0", unit: "mbar" })
  assert.deepEqual(shownNumber(18, "one", "microsiemens"), { number: "18.0", unit: "µS" })
  // A value in another unit than expected keeps its own.
  assert.deepEqual(shownNumber(5, "bar", "millibar"), { number: "5", unit: "bar" })
})

const signal = (value: Signal["value"]): Signal => ({ value, unit: null, at: null, topic: "t" })

test("a tile without a value shows a dash", () => {
  assert.equal(tileValue({ value: signal(null), shown: "percent" }), "–")
  assert.equal(tileValue({ value: { ...signal(0.5), unit: "one" }, shown: "percent" }), "50.0 %")
})
