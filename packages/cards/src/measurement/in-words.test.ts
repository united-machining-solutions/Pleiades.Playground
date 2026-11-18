import assert from "node:assert/strict"
import { test } from "node:test"

import { measurementList } from "./contract.ts"
import { measurementListInWords } from "./in-words.ts"
import { measuredValue } from "./words.ts"

test("a value is written in the unit it was published in, with its sign", () => {
  assert.equal(measuredValue({ value: 2410.08, unit: "watt" }), "2,410 W")
  assert.equal(measuredValue({ value: 5760000, unit: "joule" }), "5,760,000 J")
  assert.equal(measuredValue({ value: 51.566, unit: "degreeCelsius" }), "51.6 °C")
  assert.equal(measuredValue({ value: 0.9512, unit: "one" }), "0.95")
  assert.equal(measuredValue({ value: 15120, unit: "second" }), "4 h 12 min")
  assert.equal(measuredValue({ value: true, unit: null }), "yes")
  assert.equal(measuredValue({ value: null, unit: "watt" }), "no value")
  // A unit without a sign of its own keeps its name.
  assert.equal(measuredValue({ value: 3, unit: "pascal" }), "3.00 pascal")
})

const list = measurementList.parse({
  asOf: "2026-11-16T09:30:00.000Z",
  machines: [
    {
      machine: "P-04",
      measurements: [
        { quantity: "activePower", value: 2410.08, unit: "watt", at: "2026-11-16T09:29:58.000Z", stale: false, topic: "a" },
        { quantity: "spindleRotating", value: false, unit: null, at: "2026-11-16T09:20:00.000Z", stale: true, topic: "b" },
        { quantity: "feedOverride", value: null, unit: null, at: null, stale: true, topic: "c" },
      ],
    },
  ],
})

test("the list in words says each value, and which one is not current", () => {
  assert.equal(
    measurementListInWords(list),
    [
      "P-04: active power 2,410 W, spindle rotating no (last measured at 09:20 UTC, not current), feed override no value.",
      "Read at 09:30 UTC.",
    ].join("\n"),
  )
})

test("an empty list says that it is empty", () => {
  assert.equal(
    measurementListInWords({ asOf: list.asOf, machines: [] }),
    "No machine published a value in the last 24 hours.",
  )
})
