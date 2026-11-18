import assert from "node:assert/strict"
import { test } from "node:test"

import { notificationListOf } from "./results.ts"

const topic = "machines/alcyone-machines_AX-400_P-04/events/notifications"
const list = {
  asOf: "2026-11-17T09:00:00.000Z",
  machine: "alcyone-machines_AX-400_P-04",
  from: "2026-11-17T01:00:00.000Z",
  topic,
  notifications: [
    {
      correlationId: "c-1",
      notificationId: "2130",
      severity: "OffSpec",
      level: "Warning",
      title: "Spindle overtemperature",
      raisedAt: "2026-11-17T08:00:00.000Z",
      goneAt: "2026-11-17T08:30:00.000Z",
      durationSeconds: 1800,
      open: false,
      beforeRange: false,
      topic,
    },
  ],
  total: 1,
  open: 0,
  gone: 1,
  levels: { error: { count: 0, seconds: 0 }, warning: { count: 1, seconds: 1800 } },
  omitted: 0,
  hasMore: true,
}

test("the JSON of genui_notification_list becomes the notifications of the machine", () => {
  const values = notificationListOf(JSON.stringify(list))
  assert.equal(values?.notifications[0]?.durationSeconds, 1800)
  assert.equal(values?.hasMore, true)
})

test("what does not keep the contract of the card is not drawn as one", () => {
  assert.equal(notificationListOf(JSON.stringify({ ...list, hasMore: undefined })), null)
  assert.equal(notificationListOf(JSON.stringify({ ...list, notifications: [{ title: "x" }] })), null)
  assert.equal(notificationListOf("no notifications"), null)
  assert.equal(notificationListOf(undefined), null)
})
