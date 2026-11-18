import assert from "node:assert/strict"
import { test } from "node:test"

import type { NotificationEntry } from "./contract.ts"
import { NOTIFICATIONS_PER_PAGE, levelsOf, notificationPageOf, ofLevel } from "./pages.ts"

/** Notifications that only need to be told apart: the open ones first, as the tool returns them. */
const entries = (count: number, open = 0) =>
  Array.from({ length: count }, (_, index) => ({ correlationId: `n-${index}`, open: index < open })) as unknown as Array<NotificationEntry>

test("ten notifications a page, in the order of the result, the open ones first", () => {
  const all = entries(23, 2)
  const first = notificationPageOf(all, 1)
  assert.equal(NOTIFICATIONS_PER_PAGE, 10)
  assert.deepEqual(first.notifications.map((one) => one.correlationId), all.slice(0, 10).map((one) => one.correlationId))
  assert.deepEqual([first.page, first.pages, first.first, first.last, first.total], [1, 3, 1, 10, 23])
  const last = notificationPageOf(all, 3)
  assert.deepEqual(last.notifications.map((one) => one.correlationId), ["n-20", "n-21", "n-22"])
  assert.deepEqual([last.first, last.last], [21, 23])
})

test("up to ten notifications are one page: the card shows no pagination", () => {
  assert.equal(notificationPageOf(entries(10), 1).pages, 1)
  assert.equal(notificationPageOf(entries(11), 1).pages, 2)
})

test("a page beyond the last shows the last, as when a list read again got shorter", () => {
  const page = notificationPageOf(entries(12), 5)
  assert.deepEqual([page.page, page.first, page.last], [2, 11, 12])
})

test("without notifications there is one empty page", () => {
  assert.deepEqual(notificationPageOf([], 1), { notifications: [], page: 1, pages: 1, first: 0, last: 0, total: 0 })
})

test("a level chosen keeps the notifications of that level, in the order of the result", () => {
  const all = [
    { correlationId: "a", level: "Warning" },
    { correlationId: "b", level: "Error" },
    { correlationId: "c", level: "Warning" },
  ] as unknown as Array<NotificationEntry>
  assert.deepEqual(ofLevel(all, "Warning").map((one) => one.correlationId), ["a", "c"])
  assert.deepEqual(ofLevel(all, "Error").map((one) => one.correlationId), ["b"])
  assert.equal(ofLevel(all, "all"), all)
})

test("the totals of a level chosen count none of the other level", () => {
  const levels = { error: { count: 3, seconds: 120 }, warning: { count: 5, seconds: 600 } }
  assert.deepEqual(levelsOf(levels, "Error"), { error: { count: 3, seconds: 120 }, warning: { count: 0, seconds: 0 } })
  assert.deepEqual(levelsOf(levels, "Warning"), { error: { count: 0, seconds: 0 }, warning: { count: 5, seconds: 600 } })
  assert.equal(levelsOf(levels, "all"), levels)
})
