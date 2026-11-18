import assert from "node:assert/strict"
import { test } from "node:test"

import { alertOf, brokerPathOf, brokerPathsOf, filterOf, listOf, machineOf, matches, valueOf, valuesOf } from "./messages.ts"

const P04 = "alcyone-machines_AX-400_P-04"

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

test("what is not one value of the binding is left out", () => {
  assert.equal(valueOf("not json"), null)
  assert.equal(valueOf('{"value":1}'), null)
  assert.equal(valueOf('{"timestamp":"yesterday","value":1}'), null)
  assert.equal(valueOf('{"timestamp":"2026-11-17T19:31:00Z","value":{"x":1}}'), null)
  assert.equal(valueOf('{"timestamp":"2026-11-17T19:31:00Z","value":null}'), null)
  assert.equal(valueOf("[1,2]"), null)
})

test("a snapshot is a value for each field of text or yes and no, on the topic the store keeps it on", () => {
  const topic = `machines/${P04}/umati/State/Status`
  const payload =
    '{"timestamp":"2026-11-17T09:15:02.123Z","value":{"MachineryItemState":"Executing","MachineryOperationMode":"Processing","Count":3,"Ready":true}}'
  assert.deepEqual(valuesOf(topic, payload), [
    { topic: `${topic}/MachineryItemState`, value: { at: "2026-11-17T09:15:02.123Z", value: "Executing", unit: null } },
    { topic: `${topic}/MachineryOperationMode`, value: { at: "2026-11-17T09:15:02.123Z", value: "Processing", unit: null } },
    { topic: `${topic}/Ready`, value: { at: "2026-11-17T09:15:02.123Z", value: true, unit: null } },
  ])
})

test("one value is one value on its topic; a list, null and what is no envelope are none", () => {
  const topic = `machines/${P04}/umati/Connection/State`
  assert.deepEqual(valuesOf(topic, '{"timestamp":"2026-11-17T09:15:00Z","value":"Running"}'), [
    { topic, value: { at: "2026-11-17T09:15:00.000Z", value: "Running", unit: null } },
  ])
  assert.deepEqual(valuesOf(topic, '{"timestamp":"2026-11-17T09:15:00Z","value":[{"a":1}]}'), [])
  assert.deepEqual(valuesOf(topic, '{"timestamp":"2026-11-17T09:15:00Z","value":null}'), [])
  assert.deepEqual(valuesOf(topic, "not json"), [])
})

test("a list of the data model is read whole, entry by entry", () => {
  const list = listOf('{"timestamp":"2026-11-17T09:15:00Z","value":[{"JobOrderID":"4711/01","State":"Running"},7,null]}')
  assert.deepEqual(list, { at: "2026-11-17T09:15:00.000Z", entries: [{ JobOrderID: "4711/01", State: "Running" }] })
  assert.deepEqual(listOf('{"timestamp":"2026-11-17T09:15:00Z","value":[]}')?.entries, [])
  assert.equal(listOf('{"timestamp":"2026-11-17T09:15:00Z","value":"Running"}'), null)
})

const alert = (type: string, data: Record<string, unknown>, time = "2026-11-17T19:32:06.8622277Z") =>
  JSON.stringify({
    specversion: "1.0",
    id: "0f4c4a51-8e2b-5d6a-9c1f-4b7e2d913a60",
    source: "https://www.alcyone-machines.example/AX-400/P-04",
    type,
    time,
    sequence: "20261117T065812Z.000000001842",
    data,
  })

test("an alert event is read as the data model writes it, a CloudEvent", () => {
  const data = {
    Id: "a1",
    ErrorCode: "4105",
    Message: "Safety door open",
    Severity: "Failure",
    SeverityValue: 900,
    Time: "2026-11-17T19:32:06.500Z",
    SourceName: "Door",
  }
  assert.deepEqual(alertOf(alert("Notification.AlertRaised", data)), {
    at: "2026-11-17T19:32:06.862Z",
    action: "Raised",
    alertId: "a1",
    errorCode: "4105",
    message: "Safety door open",
    severity: "Failure",
    since: "2026-11-17T19:32:06.500Z",
  })
  assert.equal(alertOf(alert("Notification.AlertChanged", data))?.action, "Changed")
  assert.equal(alertOf(alert("Notification.AlertCleared", data))?.action, "Cleared")
  // A category the contract does not know is none; the alert still stands.
  assert.equal(alertOf(alert("Notification.AlertRaised", { ...data, Severity: "Fatal" }))?.severity, null)
})

test("a message that does not stay, an event of another group and an alert without an id are no alert", () => {
  assert.equal(alertOf(alert("Notification.NotificationEvent", { Id: "n1", Message: "Programmed stop" })), null)
  assert.equal(alertOf(alert("JobMonitoring.JobOrderStarted", { Id: "a1" })), null)
  assert.equal(alertOf(alert("Notification.AlertRaised", { Message: "No id" })), null)
  assert.equal(alertOf('{"timestamp":"2026-11-17T19:32:06Z","action":"Raised","correlationId":"c1"}'), null)
})

test("a value stamped further ahead than the clock is left out", () => {
  const now = Date.parse("2026-11-17T19:31:00Z")
  assert.equal(valueOf('{"timestamp":"2026-11-17T19:31:20Z","value":1}', now)?.value, 1)
  assert.equal(valueOf('{"timestamp":"2026-11-17T20:31:00Z","value":1}', now), null)
  assert.deepEqual(valuesOf("t", '{"timestamp":"2026-11-17T20:31:00Z","value":{"a":"b"}}', now), [])
  assert.equal(alertOf(alert("Notification.AlertRaised", { Id: "a1" }, "2026-11-17T20:31:00Z"), now), null)
})

test("a topic names its machine, and a filter matches as MQTT matches it", () => {
  assert.equal(machineOf(`machines/${P04}/umati/Connection/State`), P04)
  assert.equal(machineOf("sites/plant/weather/Temperature"), undefined)
  assert.equal(filterOf("umati/Connection/State"), "machines/+/umati/Connection/State")
  assert.equal(filterOf("umati/Connection/State", P04), `machines/${P04}/umati/Connection/State`)

  assert.ok(matches("machines/+/umati/Connection/State", `machines/${P04}/umati/Connection/State`))
  assert.ok(matches(`machines/${P04}/#`, `machines/${P04}/umati/Connection/State`))
  assert.ok(!matches("machines/+/umati/Connection/State", `machines/${P04}/umati/Connection/Heartbeat`))
  assert.ok(!matches("machines/+/umati", `machines/${P04}/umati/Connection/State`))
  assert.ok(!matches("machines/+/umati/Connection/State/More", `machines/${P04}/umati/Connection/State`))
})

test("a field of a snapshot is heard on the topic of its snapshot, any other path on itself", () => {
  assert.equal(brokerPathOf("umati/State/Status/MachineryItemState"), "umati/State/Status")
  assert.equal(brokerPathOf("umati/State/Status/MachineryOperationMode"), "umati/State/Status")
  assert.equal(brokerPathOf("umati/Connection/State"), "umati/Connection/State")
  assert.equal(brokerPathOf("umati/State/StatusMore/X"), "umati/State/StatusMore/X")
  // Both are heard: the snapshot of the data model, and the field of an adapter that sends no snapshot.
  assert.deepEqual(brokerPathsOf("umati/State/Status/MachineryItemState"), ["umati/State/Status", "umati/State/Status/MachineryItemState"])
  assert.deepEqual(brokerPathsOf("umati/Connection/State"), ["umati/Connection/State"])
})
