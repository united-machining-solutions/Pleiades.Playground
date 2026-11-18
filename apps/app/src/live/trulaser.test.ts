import assert from "node:assert/strict"
import { test } from "node:test"

import { SIGNAL_PATHS } from "@pleiades/cards/trulaser/contract.ts"
import type { Signal, TrulaserShow, TrulaserTimeline } from "@pleiades/cards/trulaser/contract.ts"

import { trulaserAt, trulaserFilters, trulaserWith } from "./trulaser.ts"

const M = "trumpf_PLL01_L1649A-STARLINER"
const topic = (path: string) => `machines/${M}/${path}`
const at = (clock: string) => `2026-11-18T${clock}.000Z`
const message = (timestamp: string, value: unknown, unit?: string) =>
  JSON.stringify({ timestamp, value, ...(unit ? { unit } : {}) })
/** The clock of the server in these tests: after every value they send. */
const NOW = Date.parse(at("10:00:00"))

const signal = (path: string, value: Signal["value"] = null, unit: string | null = null): Signal => ({
  value,
  unit,
  at: value === null ? null : at("09:00:00"),
  topic: topic(path),
})

const guide = "oem/Dalle/ConditionGuide"
const values: TrulaserShow = {
  asOf: at("09:00:00"),
  machine: M,
  serialNumber: "L1649A-STARLINER",
  signals: Object.fromEntries(
    Object.entries(SIGNAL_PATHS).map(([name, { path }]) => [name, signal(path)]),
  ) as TrulaserShow["signals"],
  sequence: null,
  unitsInMalfunction: [],
  devices: [],
  conditionGuide: [
    {
      key: "cutFluidLevel",
      label: "Cut fluid level",
      shown: "percent",
      value: signal(`${guide}/CutFluidLevel/LevelInPercent`, 0.85, "one"),
      detail: null,
      flags: [
        { level: "error", signal: signal(`${guide}/CutFluidLevel/LevelErrorReached`, false) },
        { level: "warning", signal: signal(`${guide}/CutFluidLevel/LevelWarningReached`, false) },
      ],
      status: "ok",
    },
  ],
}

const units = topic(SIGNAL_PATHS.unitsInMalfunction.path)
const item = topic(SIGNAL_PATHS.itemState.path)
const timeline: TrulaserTimeline = {
  machine: M,
  from: at("09:00:00"),
  to: at("09:01:00"),
  lanes: [
    { key: "itemState", label: "Item state", topic: item, spans: [{ from: at("09:00:00"), to: at("09:01:00"), value: "Executing" }] },
    { key: "unitsInMalfunction", label: "Units in malfunction", topic: units, spans: [{ from: at("09:00:00"), to: at("09:01:00"), value: null }] },
  ],
  malfunctions: [],
}

test("the page hears every signal of the edge component and the laser", () => {
  assert.deepEqual(trulaserFilters(M), [`machines/${M}/oem/Dalle/#`, `machines/${M}/oem/Mos/Laser1/LaserEmissionOn`])
})

test("a value of the broker takes its place in the card, and the tile reads its flags again", () => {
  const live = trulaserWith({ values, timeline }, topic(`${guide}/CutFluidLevel/LevelErrorReached`), message(at("09:01:00"), true), NOW)
  assert.equal(live.values.conditionGuide[0]?.status, "error")
  const cause = trulaserWith(
    live,
    topic(SIGNAL_PATHS.changeCauseValue.path),
    message(at("09:01:00"), "SequenceStateAndBlockingCause { SequenceState = Active, BlockingCause = Operator }"),
    NOW,
  )
  assert.deepEqual(cause.values.sequence, { sequenceState: "Active", blockingCause: "Operator" })
})

test("a value of a lane starts a new span, and one that shows the same does not", () => {
  const same = trulaserWith({ values, timeline }, item, message(at("09:00:30"), "Executing"), NOW)
  assert.equal(same.timeline?.lanes[0]?.spans.length, 1)
  const changed = trulaserWith({ values, timeline }, item, message(at("09:00:30"), "NotExecuting"), NOW)
  assert.deepEqual(changed.timeline?.lanes[0]?.spans, [
    { from: at("09:00:00"), to: at("09:00:30"), value: "Executing" },
    { from: at("09:00:30"), to: at("09:01:00"), value: "NotExecuting" },
  ])
})

test("a unit in malfunction opens a stripe, the clock stretches it, and its end closes it", () => {
  let live = trulaserWith({ values, timeline }, units, message(at("09:01:00"), "NcCycleActive"), NOW)
  assert.deepEqual(live.values.unitsInMalfunction, ["NcCycleActive"])
  assert.deepEqual(live.timeline?.malfunctions, [{ from: at("09:01:00"), to: at("09:01:00"), units: "NcCycleActive" }])
  live = trulaserAt(live, at("09:01:05"))
  assert.equal(live.timeline?.malfunctions[0]?.to, at("09:01:05"))
  assert.equal(live.timeline?.lanes[0]?.spans.at(-1)?.to, at("09:01:05"))
  live = trulaserWith(live, units, message(at("09:01:07"), ""), NOW)
  assert.deepEqual(live.timeline?.malfunctions, [{ from: at("09:01:00"), to: at("09:01:07"), units: "NcCycleActive" }])
  assert.deepEqual(live.values.unitsInMalfunction, [])
})
