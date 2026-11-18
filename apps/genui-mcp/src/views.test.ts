import assert from "node:assert/strict"
import { test } from "node:test"

import { messageStatsOf } from "./apis.ts"
import { valueOf } from "./views.ts"

test("a count of the hall is the sum of the machines, and a machine without a value is left out", () => {
  assert.equal(valueOf("errors", [{ value: 3, of: 1 }, null, { value: 4, of: 1 }]), 7)
})

test("the running share of the hall weighs each machine by the time it gave data", () => {
  // One machine ran 1 h of 2 h, the other 3 h of 4 h: together 4 h of 6 h.
  assert.equal(valueOf("running-share", [{ value: 3600, of: 7200 }, { value: 10800, of: 14400 }]), 4 / 6)
})

test("without any value there is no value", () => {
  assert.equal(valueOf("energy", [null, null]), null)
  assert.equal(valueOf("running-share", []), null)
})

test("alerts are counted by their code, with the time they stood inside the range", () => {
  const from = new Date("2026-11-18T08:00:00Z")
  const to = new Date("2026-11-18T10:00:00Z")
  const stats = messageStatsOf(
    [
      { errorCode: "2130", message: "Spindle overtemperature", severity: "Failure", raisedAt: "2026-11-18T07:00:00Z", clearedAt: "2026-11-18T08:30:00Z" },
      { errorCode: "2130", message: "Spindle overtemperature", severity: "Failure", raisedAt: "2026-11-18T09:30:00Z", clearedAt: null },
      { errorCode: "4105", message: "Safety door open", severity: "CheckFunction", raisedAt: "2026-11-18T09:00:00Z", clearedAt: "2026-11-18T09:10:00Z" },
    ],
    from,
    to,
  )
  assert.deepEqual(stats, [
    { notificationId: "2130", title: "Spindle overtemperature", level: "Error", count: 2, seconds: 3600 },
    { notificationId: "4105", title: "Safety door open", level: "Warning", count: 1, seconds: 600 },
  ])
})
