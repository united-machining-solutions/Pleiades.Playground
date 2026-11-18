import assert from "node:assert/strict"
import { test } from "node:test"

import { laneValueOf, sequenceOf, statusOf, unitsOf } from "./contract.ts"
import type { Flag } from "./contract.ts"

test("the change cause is read as the state of its sequence and what blocks it", () => {
  assert.deepEqual(sequenceOf("SequenceStateAndBlockingCause { SequenceState = Active, BlockingCause = Operator }"), {
    sequenceState: "Active",
    blockingCause: "Operator",
  })
  assert.deepEqual(sequenceOf("SequenceStateAndBlockingCause { SequenceState = Idle, BlockingCause = None }"), {
    sequenceState: "Idle",
    blockingCause: null,
  })
  assert.equal(sequenceOf("1"), null)
  assert.equal(sequenceOf(null), null)
})

test("the units in malfunction are a list separated by commas, none where it is empty", () => {
  assert.deepEqual(unitsOf("NcCycleActive, LoadMasterCenterSheetLoad"), ["NcCycleActive", "LoadMasterCenterSheetLoad"])
  assert.deepEqual(unitsOf(""), [])
  assert.deepEqual(unitsOf(null), [])
})

test("a lane shows the sequence in words, and nothing where no unit is in malfunction", () => {
  const blocked = "SequenceStateAndBlockingCause { SequenceState = Active, BlockingCause = Other }"
  assert.equal(laneValueOf("sequence", blocked), "Active, blocked: Other")
  assert.equal(laneValueOf("units", ""), null)
  assert.equal(laneValueOf("units", "NcCycleActive"), "NcCycleActive")
  assert.equal(laneValueOf("as-is", "Executing"), "Executing")
})

const flag = (level: Flag["level"], value: boolean | null): Flag => ({
  level,
  signal: { value, unit: null, at: null, topic: "t" },
})

test("a tile says the worst threshold that is raised", () => {
  assert.equal(statusOf([]), null)
  assert.equal(statusOf([flag("error", false), flag("warning", false)]), "ok")
  assert.equal(statusOf([flag("error", false), flag("warning", true)]), "warning")
  assert.equal(statusOf([flag("error", true), flag("warning", true)]), "error")
  assert.equal(statusOf([flag("error", null)]), "ok")
})
