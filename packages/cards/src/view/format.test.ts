import assert from "node:assert/strict"
import { test } from "node:test"

import { secondsText, valueText } from "./format.ts"

test("a value is written in its unit, with a prefix for energy", () => {
  assert.equal(valueText(12, "count"), "12")
  assert.equal(valueText(0.834, "one"), "83 %")
  assert.equal(valueText(59_800_000, "joule"), "59.8 MJ")
  assert.equal(valueText(950, "joule"), "950 J")
  assert.equal(valueText(null, "count"), "–")
})

test("a duration reads like on a shop floor", () => {
  assert.equal(secondsText(40), "40 s")
  assert.equal(secondsText(12 * 60), "12 min")
  assert.equal(secondsText(65 * 60), "1 h 05 min")
})
