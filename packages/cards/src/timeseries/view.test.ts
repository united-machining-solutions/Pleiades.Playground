import assert from "node:assert/strict"
import { test } from "node:test"

import { NO_AXES, axesFor, lastValue, matchesSearch, nextColour } from "./view.ts"

test("the first unit goes left, the second right", () => {
  assert.deepEqual(axesFor(NO_AXES, ["watt", "watt", "degreeCelsius"]), { left: "watt", right: "degreeCelsius" })
})

test("a unit stays on its axis while lines come and go", () => {
  const both = { left: "watt", right: "degreeCelsius" }
  // The lines in watt are removed: degrees stay right, and the left axis is free.
  assert.deepEqual(axesFor(both, ["degreeCelsius"]), { left: null, right: "degreeCelsius" })
  // A new unit takes the free axis.
  assert.deepEqual(axesFor({ left: null, right: "degreeCelsius" }, ["one", "degreeCelsius"]), { left: "one", right: "degreeCelsius" })
})

test("a third unit has no axis", () => {
  assert.equal(axesFor({ left: "watt", right: "degreeCelsius" }, ["watt", "degreeCelsius", "one"]), null)
})

test("a new line takes the first colour no line has, and there are eight", () => {
  assert.equal(nextColour([]), 1)
  assert.equal(nextColour([1, 2, 4]), 3)
  assert.equal(nextColour([1, 2, 3, 4, 5, 6, 7, 8]), null)
})

test("a search finds a signal by every word typed, in any order and case", () => {
  const said = ["alcyone-machines_AX-400_P-04", "Active power", "umati/Consumption/Electricity/Main/AcActivePowerTotal"]
  assert.equal(matchesSearch(said, "P-04 power"), true)
  assert.equal(matchesSearch(said, "POWER ax-400"), true)
  assert.equal(matchesSearch(said, ""), true)
  assert.equal(matchesSearch(said, "P-07 power"), false)
})

test("the newest value of a line is current only where the line has it at its end", () => {
  assert.deepEqual(lastValue([1, 2, 3]), { value: 3, current: true })
  // The machine fell silent after 2: the value is the last one known, not what it measures now.
  assert.deepEqual(lastValue([1, 2, null, null]), { value: 2, current: false })
  assert.deepEqual(lastValue([true, false]), { value: false, current: true })
  assert.equal(lastValue([null, null]), null)
})
