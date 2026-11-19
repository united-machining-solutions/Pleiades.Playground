import assert from "node:assert/strict"
import { test } from "node:test"

import { detailText, enumText, sequenceOf, signalValueFields, statusOf } from "./contract.ts"
import type { Flag } from "./contract.ts"

test("the SignalValue of a change cause is read as its SequenceState and BlockingCause", () => {
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

test("on hover a detail says itself, and nothing if it is empty", () => {
  assert.equal(detailText({ name: "ChangeCause.SignalValue", value: "1" }), "1")
  assert.equal(detailText({ name: "ActiveWorkMaster", value: "PLL_SHEET_0001" }), "PLL_SHEET_0001")
  assert.equal(detailText({ name: "ErrorCode", value: null }), null)
  assert.equal(detailText({ name: "Message", value: "" }), null)
})

test("a request of a device that caused the change reads as its fields, as the edge component writes them", () => {
  const message =
    '{ "utcTimestamp": "2026-11-18T12:44:42.972Z", "deviceType": "DEVICE_TYPE_HANDLING_LOAD", "deviceDescription": "LiftMaster", "state": "DEVICE_REQUEST_STATE_ACTIVE", "errorCode": "ERROR_CODE_NO_ERROR" }'
  assert.deepEqual(signalValueFields(message), [
    { name: "DeviceType", value: "HandlingLoad" },
    { name: "DeviceDescription", value: "LiftMaster" },
    { name: "State", value: "Active" },
    { name: "ErrorCode", value: "NoError" },
  ])
})

test("a SignalValue of another shape stands as it is", () => {
  assert.deepEqual(signalValueFields("SequenceStateAndBlockingCause { SequenceState = Idle, BlockingCause = None }"), [
    { name: "SequenceState", value: "Idle" },
    { name: "BlockingCause", value: "None" },
  ])
  assert.equal(signalValueFields("1"), null)
  assert.equal(signalValueFields("[1, 2]"), null)
  assert.equal(signalValueFields("{}"), null)
  assert.equal(enumText("state", "PRODUCTION_PLAN_STATE_RUNNING"), "Running")
  assert.equal(enumText("deviceDescription", "LiftMaster"), "LiftMaster")
  // Only an enumeration: ids in capitals stay as they are, so they can be searched for.
  assert.equal(enumText("programName", "PLL_SHEET_0001"), "PLL_SHEET_0001")
  assert.equal(enumText("serial", "L1649A"), "L1649A")
  assert.equal(enumText("state", "RUNNING"), "RUNNING")
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
