import assert from "node:assert/strict"
import { test } from "node:test"

import { filterOf, machineOf, matches, notificationOf, valueOf } from "./messages.ts"

test("a value of the binding is read with its instant to the millisecond, in UTC", () => {
  assert.deepEqual(valueOf('{"timestamp":"2026-11-17T19:31:01.2825979+00:00","value":52.48,"unit":"degreeCelsius"}'), {
    at: "2026-11-17T19:31:01.282Z",
    value: 52.48,
    unit: "degreeCelsius",
  })
  assert.deepEqual(valueOf('{"timestamp":"2026-11-17T19:31:00.8341945Z","value":"Executing"}'), {
    at: "2026-11-17T19:31:00.834Z",
    value: "Executing",
    unit: null,
  })
  assert.equal(valueOf('{"timestamp":"2026-11-17T19:31:00Z","value":true}')?.value, true)
})

test("what is not a value of the binding is left out", () => {
  assert.equal(valueOf("not json"), null)
  assert.equal(valueOf('{"value":1}'), null)
  assert.equal(valueOf('{"timestamp":"yesterday","value":1}'), null)
  assert.equal(valueOf('{"timestamp":"2026-11-17T19:31:00Z","value":{"x":1}}'), null)
  assert.equal(valueOf("[1,2]"), null)
})

test("a notification event is read as the Events API writes it", () => {
  const event = notificationOf(
    '{"timestamp":"2026-11-17T19:32:06.8622277Z","id":"a","mId":"P-04","level":"Warning","action":"Raised","title":"Safety door open","notificationId":"4105","correlationId":"c1"}',
  )
  assert.deepEqual(event, {
    at: "2026-11-17T19:32:06.862Z",
    action: "Raised",
    level: "Warning",
    title: "Safety door open",
    notificationId: "4105",
    correlationId: "c1",
  })
  assert.equal(notificationOf('{"timestamp":"2026-11-17T19:32:06Z","action":"Opened","correlationId":"c1"}'), null)
  assert.equal(notificationOf('{"timestamp":"2026-11-17T19:32:06Z","action":"Reset"}'), null)
})

test("a value stamped further ahead than the clock is left out", () => {
  const now = Date.parse("2026-11-17T19:31:00Z")
  assert.equal(valueOf('{"timestamp":"2026-11-17T19:31:20Z","value":1}', now)?.value, 1)
  assert.equal(valueOf('{"timestamp":"2026-11-17T20:31:00Z","value":1}', now), null)
  assert.equal(notificationOf('{"timestamp":"2026-11-17T20:31:00Z","action":"Raised","correlationId":"c1"}', now), null)
})

test("a topic names its machine, and a filter matches as MQTT matches it", () => {
  assert.equal(machineOf("machines/P-04/umati/Connection/State"), "P-04")
  assert.equal(machineOf("sites/plant/weather/Temperature"), undefined)
  assert.equal(filterOf("umati/Connection/State"), "machines/+/umati/Connection/State")
  assert.equal(filterOf("umati/Connection/State", "P-04"), "machines/P-04/umati/Connection/State")

  assert.ok(matches("machines/+/umati/Connection/State", "machines/P-04/umati/Connection/State"))
  assert.ok(matches("machines/P-04/#", "machines/P-04/umati/Connection/State"))
  assert.ok(!matches("machines/+/umati/Connection/State", "machines/P-04/umati/Connection/Heartbeat"))
  assert.ok(!matches("machines/+/umati", "machines/P-04/umati/Connection/State"))
  assert.ok(!matches("machines/+/umati/Connection/State/More", "machines/P-04/umati/Connection/State"))
})
