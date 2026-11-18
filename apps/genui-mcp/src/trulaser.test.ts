import assert from "node:assert/strict"
import { test } from "node:test"

import { laneSpans, malfunctionsOf, thinnedLane } from "./trulaser.ts"

const at = (clock: string) => `2026-11-18T${clock}.000Z`

test("a value holds until the next one, and the value before the hours holds where they begin", () => {
  const samples = [
    { at: at("08:50:00"), value: "NotExecuting" },
    { at: at("09:00:10"), value: "Executing" },
    { at: at("09:00:20"), value: "Executing" },
    { at: at("09:00:30"), value: "NotExecuting" },
  ]
  assert.deepEqual(laneSpans(samples, "as-is", at("09:00:00"), at("09:01:00")), [
    { from: at("09:00:00"), to: at("09:00:10"), value: "NotExecuting" },
    { from: at("09:00:10"), to: at("09:00:30"), value: "Executing" },
    { from: at("09:00:30"), to: at("09:01:00"), value: "NotExecuting" },
  ])
})

test("where nothing was known yet, a lane has no value", () => {
  assert.deepEqual(laneSpans([{ at: at("09:00:30"), value: "Idle" }], "as-is", at("09:00:00"), at("09:01:00")), [
    { from: at("09:00:00"), to: at("09:00:30"), value: null },
    { from: at("09:00:30"), to: at("09:01:00"), value: "Idle" },
  ])
})

test("the units in malfunction become the stripes that cross every lane", () => {
  const samples = [
    { at: at("09:00:00"), value: "" },
    { at: at("09:00:10"), value: "NcCycleActive" },
    { at: at("09:00:12"), value: "" },
  ]
  const spans = laneSpans(samples, "units", at("09:00:00"), at("09:01:00"))
  assert.deepEqual(malfunctionsOf(spans), [{ from: at("09:00:10"), to: at("09:00:12"), units: "NcCycleActive" }])
})

test("a lane with more spans than slots shows in each slot the value that lasted longest", () => {
  const spans = [
    { from: at("09:00:00"), to: at("09:00:08"), value: "A" },
    { from: at("09:00:08"), to: at("09:00:10"), value: "B" },
    { from: at("09:00:10"), to: at("09:00:12"), value: "B" },
    { from: at("09:00:12"), to: at("09:00:20"), value: "C" },
  ]
  assert.deepEqual(thinnedLane(spans, 2), [
    { from: at("09:00:00"), to: at("09:00:10"), value: "A" },
    { from: at("09:00:10"), to: at("09:00:20"), value: "C" },
  ])
  assert.deepEqual(thinnedLane(spans, 4), spans)
})
