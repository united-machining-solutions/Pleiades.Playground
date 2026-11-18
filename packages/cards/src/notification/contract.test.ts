import assert from "node:assert/strict"
import { test } from "node:test"

import { notificationList } from "./contract.ts"

const topic = "machines/alcyone-machines_AX-400_P-04/events/notifications"
const entry = {
  correlationId: "c-1",
  notificationId: "2130",
  severity: "Failure",
  level: "Error",
  title: "Spindle overtemperature",
  raisedAt: "2026-11-17T08:00:00.000Z",
  goneAt: null,
  durationSeconds: null,
  open: true,
  beforeRange: false,
  topic,
}
const list = {
  asOf: "2026-11-17T09:00:00.000Z",
  machine: "alcyone-machines_AX-400_P-04",
  from: "2026-11-17T01:00:00.000Z",
  topic,
  notifications: [entry],
  total: 1,
  open: 1,
  gone: 0,
  levels: { error: { count: 1, seconds: 3600 }, warning: { count: 0, seconds: 0 } },
  omitted: 0,
  hasMore: false,
}

test("a list that keeps the contract is accepted, with an alert that has not been cleared", () => {
  assert.equal(notificationList.safeParse(list).success, true)
})

test("an alert may come without a category, and a machine id is any name that does not break a topic", () => {
  assert.equal(notificationList.safeParse({ ...list, notifications: [{ ...entry, severity: null }] }).success, true)
  assert.equal(notificationList.safeParse({ ...list, machine: "a/b" }).success, false)
})

test("an alert has the time it was raised: a list whose alert has none is refused", () => {
  assert.equal(notificationList.safeParse({ ...list, notifications: [{ ...entry, raisedAt: null }] }).success, false)
})

test("a list without the counts, the levels or hasMore is refused", () => {
  for (const key of ["total", "levels", "hasMore"] as const) {
    const without = { ...list, [key]: undefined }
    assert.equal(notificationList.safeParse(without).success, false, key)
  }
})

test("only warnings and errors are notifications of the card", () => {
  assert.equal(notificationList.safeParse({ ...list, notifications: [{ ...entry, level: "Information" }] }).success, false)
})
