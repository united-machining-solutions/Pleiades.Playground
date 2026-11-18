import assert from "node:assert/strict"
import { test } from "node:test"

import type { Signal, TrulaserShow } from "./contract.ts"
import { SIGNAL_PATHS } from "./contract.ts"
import { shownNumber, tileValue, trulaserShowInWords, trulaserTitle } from "./words.ts"

test("a display writes a fraction as percent and a pressure in pascal as millibar", () => {
  assert.deepEqual(shownNumber(0.85, "one", "percent"), { number: "85.0", unit: "%" })
  assert.deepEqual(shownNumber(513000, "pascal", "millibar"), { number: "5130.0", unit: "mbar" })
  assert.deepEqual(shownNumber(18, "one", "microsiemens"), { number: "18.0", unit: "µS" })
  // A value in another unit than expected keeps its own.
  assert.deepEqual(shownNumber(5, "bar", "millibar"), { number: "5", unit: "bar" })
})

const signal = (value: Signal["value"], topic = "t"): Signal => ({ value, unit: null, at: null, topic })

test("a tile without a value shows a dash", () => {
  assert.equal(tileValue({ value: signal(null), shown: "percent" }), "–")
  assert.equal(tileValue({ value: { ...signal(0.5), unit: "one" }, shown: "percent" }), "50.0 %")
})

const shown: TrulaserShow = {
  asOf: "2026-11-18T10:00:00.000Z",
  machine: "trumpf_PLL01_L1649A-STARLINER",
  serialNumber: "L1649A-STARLINER",
  signals: {
    ...(Object.fromEntries(Object.keys(SIGNAL_PATHS).map((name) => [name, signal(null, name)])) as TrulaserShow["signals"]),
    itemState: signal("Executing"),
    operationMode: signal("Processing"),
    changeCauseSignal: signal("NcCycleActive"),
    programName: signal("PLL_SHEET_0327"),
    programRunState: signal("Start"),
    productionPlanRunState: signal("Running"),
    collisionState: signal("Idle"),
  },
  sequence: { sequenceState: "Active", blockingCause: "Operator" },
  unitsInMalfunction: ["NcCycleActive"],
  devices: [
    { index: 0, type: signal("HandlingLoad"), state: signal("Active"), errorCode: signal("NoError") },
    { index: 1, type: signal("Sorting"), state: signal("Invalid"), errorCode: signal("Invalid") },
  ],
  conditionGuide: [
    {
      key: "coolLinePressure",
      label: "Cool line pressure",
      shown: "millibar",
      value: { ...signal(3500), unit: "pascal" },
      detail: null,
      flags: [],
      status: "error",
    },
  ],
}

test("the card in words names the state, its cause, the units in malfunction and what is raised", () => {
  assert.equal(trulaserTitle(shown), "TruLaser L1649A-STARLINER")
  assert.equal(
    trulaserShowInWords(shown),
    [
      "TruLaser L1649A-STARLINER (trumpf_PLL01_L1649A-STARLINER): Executing, operation mode Processing. Change cause: NcCycleActive (sequence Active, blocked by Operator).",
      "Units in malfunction: NcCycleActive.",
      "Program PLL_SHEET_0327: Start. Production plan: Running.",
      "Automation requests: active for HandlingLoad (2 devices).",
      "Collision detection: Idle.",
      "Condition guide: Cool line pressure 35.0 mbar (error).",
      "Read at 10:00 UTC.",
    ].join("\n"),
  )
})
