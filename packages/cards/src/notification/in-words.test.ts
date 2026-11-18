import assert from "node:assert/strict"
import { test } from "node:test"

import type { NotificationEntry, NotificationList } from "./contract.ts"
import { notificationListInWords } from "./in-words.ts"
import { outcomeText, span, totalsInWords } from "./words.ts"

const topic = "machines/alcyone-machines_AX-400_P-04/events/notifications"
const entry = (more: Partial<NotificationEntry>): NotificationEntry => ({
  correlationId: "c",
  notificationId: "2130",
  severity: "Failure",
  level: "Error",
  title: "Spindle overtemperature",
  raisedAt: "2026-11-17T08:00:00.000+00:00",
  goneAt: null,
  durationSeconds: null,
  open: true,
  beforeRange: false,
  topic,
  ...more,
})
const none = { count: 0, seconds: 0 }
const list = (more: Partial<NotificationList>): NotificationList => ({
  asOf: "2026-11-17T09:00:00.000+00:00",
  machine: "alcyone-machines_AX-400_P-04",
  from: "2026-11-17T01:00:00.000+00:00",
  topic,
  notifications: [],
  total: 0,
  open: 0,
  gone: 0,
  levels: { error: none, warning: none },
  omitted: 0,
  hasMore: false,
  ...more,
})
const oneError = list({
  notifications: [entry({})],
  total: 1,
  open: 1,
  levels: { error: { count: 1, seconds: 3600 }, warning: none },
})

test("an alert that stands says that it has not gone, and the list says how many are open", () => {
  const words = notificationListInWords(oneError)
  assert.match(words, /AX-400 P-04 \(alcyone-machines_AX-400_P-04\), 01:00 to 09:00: 1 error, 1 open\./)
  assert.match(words, /Error 2130 "Spindle overtemperature": raised 08:00, has not gone$/m)
})

test("an alert that was cleared says when it went and how long it stood", () => {
  const gone = entry({ goneAt: "2026-11-17T08:25:00.000+00:00", durationSeconds: 1500, open: false })
  const words = notificationListInWords(
    list({ notifications: [gone], total: 1, gone: 1, levels: { error: { count: 1, seconds: 1500 }, warning: none } }),
  )
  assert.match(words, /raised 08:00, gone 08:25 · lasted 25 min/)
})

test("the levels are counted apart, and each level adds up how long its alerts stood", () => {
  const words = notificationListInWords(
    list({
      notifications: [entry({})],
      total: 3,
      open: 1,
      gone: 2,
      levels: { error: { count: 1, seconds: 720 }, warning: { count: 2, seconds: 300 } },
    }),
  )
  assert.match(words, /1 error and 2 warnings, 1 open\./)
  assert.match(words, /^In the range, errors stood 12 min in total, warnings 5 min in total\.$/m)
  assert.equal(totalsInWords(list({ levels: { error: none, warning: { count: 1, seconds: 40 } } })), "In the range, warnings stood 40 s in total")
})

test("one raised the day before says the day, and one raised before the range says so", () => {
  const early = entry({ raisedAt: "2026-11-16T22:10:00.000+00:00", beforeRange: true })
  const words = notificationListInWords(list({ ...oneError, notifications: [early] }))
  assert.match(words, /raised 16 Nov 22:10, has not gone, raised before the range/)
})

test("an alert without an error code or a message is not given a made-up one", () => {
  const bare = entry({ notificationId: "", title: "" })
  assert.match(notificationListInWords(list({ ...oneError, notifications: [bare] })), /^- Error "": raised 08:00/m)
})

test("when the Events API had more, the counts are called lower bounds", () => {
  const words = notificationListInWords(list({ ...oneError, hasMore: true }))
  assert.match(words, /at least 1 error/)
  assert.match(words, /oldest are missing and the counts are lower bounds/)
})

test("a list longer than the words name says how many more are on the card, and apart from them how many are not listed at all", () => {
  const many = Array.from({ length: 12 }, (_, index) => entry({ correlationId: `c${index}` }))
  const words = notificationListInWords(list({ ...oneError, notifications: many, total: 22, open: 22, omitted: 10 }))
  assert.equal(words.split("\n").filter((line) => line.startsWith("- ")).length, 8)
  // 12 rows, 8 of them named: 4 more are on the card. The 10 omitted are on neither.
  assert.match(words, /^4 more are on the card\.$/m)
  assert.match(words, /^10 more are not listed, neither here nor on the card\.$/m)
  assert.doesNotMatch(words, /14 more/)
})

test("a list the words name whole and the card holds whole has no line about more", () => {
  assert.doesNotMatch(notificationListInWords(list({ ...oneError })), /more/)
})

test("the range is written with its day where it does not begin on the day of now, and not where it does", () => {
  const day = list({ ...oneError, from: "2026-11-16T09:00:00.000+00:00" })
  assert.match(notificationListInWords(day), /, 16 Nov 09:00 to 09:00: 1 error/)
  const overnight = list({ ...oneError, asOf: "2026-11-17T02:00:00.000+00:00", from: "2026-11-16T18:00:00.000+00:00" })
  assert.match(notificationListInWords(overnight), /, 16 Nov 18:00 to 02:00: 1 error/)
  assert.match(notificationListInWords(oneError), /, 01:00 to 09:00: 1 error/)
})

test("no alert is said in a sentence, with the reason when data may be missing", () => {
  assert.equal(
    notificationListInWords(list({})),
    "AX-400 P-04 (alcyone-machines_AX-400_P-04): no warning or error stood between 01:00 and 09:00.",
  )
  assert.match(notificationListInWords(list({ hasMore: true })), /may be missing/)
})

test("where an alert came and went in the same minute only its duration is said, in seconds", () => {
  const time = (instant: string) => instant.slice(11, 16)
  const brief = entry({ goneAt: "2026-11-17T08:00:40.166+00:00", durationSeconds: 40.166, open: false })
  assert.deepEqual(outcomeText(brief, time), { open: false, text: "lasted 40 s" })
  const long = entry({ goneAt: "2026-11-17T08:25:00.000+00:00", durationSeconds: 1500, open: false })
  assert.deepEqual(outcomeText(long, time), { open: false, text: "gone 08:25 · lasted 25 min" })
  assert.deepEqual(outcomeText(entry({}), time), { open: true, text: "still open" })
  assert.equal(span(59.4), "59 s")
  assert.equal(span(60), "1 min")
  // The unit changes where the rounded number does: 60 s is never written.
  assert.equal(span(59.5), "1 min")
  assert.equal(span(59.99), "1 min")
  assert.equal(span(119.6), "2 min")
})
