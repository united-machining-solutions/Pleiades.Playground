import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"

import { listNotifications } from "./notifications.ts"

const apis = { timeseriesUrl: "http://timeseries:8080", eventsUrl: "http://events:8080" }
const now = new Date("2026-11-17T12:00:00.000Z")
/** The instant so many minutes before `now`. */
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString()

afterEach(() => mock.restoreAll())

type Alert = {
  id: string
  machine: string
  severity: string
  raisedAt: string
  clearedAt: string | null
}

/**
 * An Events API that holds `alerts` and answers `/alerts/pairs` as the real one does: the alerts
 * that stood at some time between `from` and `to` (raised before the end, not cleared before the
 * start), newest first, at most `Take`, and whether there were more. The Timeseries API names the
 * machines that published a value, `machines`: the machine of the test only if nothing else is said.
 */
function serve(alerts: Array<Alert>, options: { total?: number; machines?: Array<string> } = {}): Array<URL> {
  const requested: Array<URL> = []
  mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input))
    if (url.pathname === "/topics") {
      const machines = options.machines ?? [P04]
      return Response.json({ baseUnitTopics: machines.map((machine) => `machines/${machine}/activePower`), stringTopics: [], booleanTopics: [] })
    }
    requested.push(url)
    const [from, to] = [url.searchParams.get("from") ?? "", url.searchParams.get("to") ?? ""]
    const machine = url.searchParams.get("mId")
    const stood = alerts
      .filter((one) => one.machine === machine && one.raisedAt <= to && (one.clearedAt === null || one.clearedAt >= from))
      .sort((a, b) => b.raisedAt.localeCompare(a.raisedAt))
    const take = Number(url.searchParams.get("Take") ?? 100)
    const items = stood.slice(0, take).map((one) => ({
      mId: one.machine,
      alertId: one.id,
      errorCode: `E-${one.id}`,
      message: `Message ${one.id}`,
      severity: one.severity,
      raisedAt: one.raisedAt,
      clearedAt: one.clearedAt,
    }))
    const totalCount = options.total ?? stood.length
    return Response.json({ items, totalCount, hasMore: totalCount > items.length })
  })
  return requested
}

const P04 = "alcyone-machines_AX-400_P-04"

const alert = (
  id: string,
  severity: string,
  raisedMinutesAgo: number,
  clearedMinutesAgo: number | null,
  machine = P04,
): Alert => ({
  id,
  machine,
  severity,
  raisedAt: ago(raisedMinutesAgo),
  clearedAt: clearedMinutesAgo === null ? null : ago(clearedMinutesAgo),
})

test("an alert that was cleared has its raised and cleared times and its duration in seconds, and one that stands has neither a clear nor a duration", async () => {
  serve([alert("a", "Failure", 60, 50), alert("b", "CheckFunction", 20, null)])
  const list = await listNotifications(apis, P04, 8, now)
  const [open, gone] = list.notifications
  assert.equal(open?.correlationId, "b")
  assert.deepEqual([open?.open, open?.goneAt, open?.durationSeconds], [true, null, null])
  assert.deepEqual([gone?.open, gone?.raisedAt, gone?.goneAt, gone?.durationSeconds], [false, ago(60), ago(50), 600])
  assert.deepEqual([list.total, list.open, list.gone, list.omitted, list.hasMore], [2, 1, 1, 0, false])
})

test("a failure is an error and every other category a warning, with its error code and message", async () => {
  serve([
    alert("a", "Failure", 60, null),
    alert("b", "CheckFunction", 50, null),
    alert("c", "OffSpec", 40, null),
    alert("d", "MaintenanceRequired", 30, null),
  ])
  const { notifications, levels } = await listNotifications(apis, P04, 8, now)
  assert.deepEqual(
    notifications.map((one) => [one.correlationId, one.level, one.severity]),
    [
      ["d", "Warning", "MaintenanceRequired"],
      ["c", "Warning", "OffSpec"],
      ["b", "Warning", "CheckFunction"],
      ["a", "Error", "Failure"],
    ],
  )
  assert.equal(notifications[0]?.notificationId, "E-d")
  assert.equal(notifications[0]?.title, "Message d")
  assert.deepEqual([levels.error.count, levels.warning.count], [1, 3])
})

test("the alerts of the one machine are asked for between the start of the range and now, under the machine id", async () => {
  const requested = serve([], { machines: ["alcyone machines_AX-400_P-04"] })
  const list = await listNotifications(apis, "alcyone machines_AX-400_P-04", 1, now)
  assert.equal(requested.length, 1)
  const [url] = requested
  assert.equal(url?.pathname, "/alerts/pairs")
  assert.equal(url?.searchParams.get("mId"), "alcyone machines_AX-400_P-04")
  assert.equal(url?.searchParams.get("from"), ago(60))
  assert.equal(url?.searchParams.get("to"), now.toISOString())
  assert.equal(list.from, ago(60))
  assert.equal(list.topic, "machines/alcyone machines_AX-400_P-04/events/notifications")
})

test("one raised before the range that has not been cleared stands in the range, with its real beginning and no duration", async () => {
  serve([alert("a", "Failure", 5 * 60, null)])
  const list = await listNotifications(apis, P04, 1, now)
  const [entry] = list.notifications
  assert.deepEqual([entry?.raisedAt, entry?.open, entry?.beforeRange, entry?.durationSeconds], [ago(300), true, true, null])
  assert.equal(list.open, 1)
})

test("one raised before the range that was cleared inside it keeps its whole duration, not the part in the range", async () => {
  serve([alert("a", "Failure", 90, 30)])
  const list = await listNotifications(apis, P04, 1, now)
  const [entry] = list.notifications
  assert.deepEqual([entry?.raisedAt, entry?.goneAt, entry?.beforeRange, entry?.durationSeconds], [ago(90), ago(30), true, 3600])
})

test("one that was cleared before the range is not in it", async () => {
  serve([alert("a", "Failure", 300, 200)])
  const list = await listNotifications(apis, P04, 1, now)
  assert.deepEqual([list.total, list.notifications.length], [0, 0])
})

test("one that has not been cleared and was raised more than 24 hours ago is not listed, as the list of machines names none that old", async () => {
  serve([alert("old", "Failure", 30 * 60, null), alert("new", "Failure", 23 * 60, null)])
  const list = await listNotifications(apis, P04, 24, now)
  assert.deepEqual(
    list.notifications.map((one) => one.correlationId),
    ["new"],
  )
  assert.equal(list.open, 1)
})

test("one that was cleared in the range is listed whenever it was raised: its beginning is known", async () => {
  serve([alert("old", "Failure", 30 * 60, 10)])
  const list = await listNotifications(apis, P04, 8, now)
  assert.deepEqual([list.notifications[0]?.raisedAt, list.notifications[0]?.durationSeconds], [ago(1800), 1790 * 60])
})

test("when the Events API had more than it returned, hasMore says so and the counts stay what was found", async () => {
  serve([alert("a", "Failure", 60, null), alert("b", "OffSpec", 30, null)], { total: 1500 })
  const list = await listNotifications(apis, P04, 8, now)
  assert.equal(list.hasMore, true)
  assert.equal(list.total, 2)
})

test("without more, hasMore is false", async () => {
  serve([alert("a", "Failure", 60, null)])
  assert.equal((await listNotifications(apis, P04, 8, now)).hasMore, false)
})

test("the list holds at most 50 notifications, those that have not gone first, and counts the others as omitted", async () => {
  const gone = Array.from({ length: 60 }, (_, index) => alert(`g${index}`, "Failure", 200 - index, 100 - index))
  serve([...gone, alert("open-old", "OffSpec", 400, null)])
  const list = await listNotifications(apis, P04, 8, now)
  assert.equal(list.notifications.length, 50)
  assert.equal(list.notifications[0]?.correlationId, "open-old")
  assert.deepEqual([list.total, list.open, list.gone, list.omitted], [61, 1, 60, 11])
  // The newest of the others come next.
  assert.equal(list.notifications[1]?.correlationId, "g59")
})

test("a machine that published values and has no alerts gets an empty list", async () => {
  const P05 = "alcyone-machines_AX-400_P-05"
  serve([alert("a", "Failure", 60, null, P05)], { machines: [P04, P05] })
  const list = await listNotifications(apis, P04, 8, now)
  assert.deepEqual([list.total, list.hasMore, list.notifications], [0, false, []])
})

test("a machine that published nothing in the last 24 hours is refused, with the machines that did, not answered with an all-clear", async () => {
  serve([], { machines: [P04, "alcyone-machines_AX-400_P-05"] })
  // The label of a machine, not its id, is what a person or a model may mistype.
  await assert.rejects(
    listNotifications(apis, "P-04", 8, now),
    /^Error: No machine "P-04" published a value in the last 24 hours. Machines that did: alcyone-machines_AX-400_P-04, alcyone-machines_AX-400_P-05.$/,
  )
})

test("the machines are looked for over the same 24 hours the list of machines looks at", async () => {
  const topics: Array<URL> = []
  mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input))
    if (url.pathname === "/topics") topics.push(url)
    return url.pathname === "/topics"
      ? Response.json({ baseUnitTopics: [`machines/${P04}/activePower`] })
      : Response.json({ items: [], hasMore: false })
  })
  await listNotifications(apis, P04, 1, now)
  assert.deepEqual([topics[0]?.searchParams.get("startTime"), topics[0]?.searchParams.get("stopTime")], [ago(24 * 60), now.toISOString()])
})

test("the totals count only the time in the range: one raised before it and cleared inside it adds the part after the start", async () => {
  // 8 hours range. "a" came 10 days ago and went an hour ago; "b" came 9 hours ago and has not gone.
  serve([alert("a", "Failure", 10 * 24 * 60, 60), alert("b", "OffSpec", 9 * 60, null), alert("c", "Failure", 30, 10)])
  const { levels, notifications } = await listNotifications(apis, P04, 8, now)
  // 8 hours minus the last hour is 7 hours, and 20 minutes of "c".
  assert.deepEqual(levels.error, { count: 2, seconds: 7 * 3600 + 1200 })
  // All 8 hours of the range.
  assert.deepEqual(levels.warning, { count: 1, seconds: 8 * 3600 })
  // A row keeps the whole duration of its alert.
  assert.equal(notifications.find((one) => one.correlationId === "a")?.durationSeconds, (10 * 24 * 60 - 60) * 60)
})

test("each level adds up how long its alerts stood, those that have not gone until now", async () => {
  serve([alert("a", "Failure", 60, 50), alert("b", "OffSpec", 20, null), alert("c", "CheckFunction", 40, 35)])
  const { levels } = await listNotifications(apis, P04, 8, now)
  assert.deepEqual(levels.error, { count: 1, seconds: 600 })
  // 20 minutes since "b" was raised, and 5 minutes of "c".
  assert.deepEqual(levels.warning, { count: 2, seconds: 1500 })
})

test("an answer without hasMore is refused, because the list could not say whether it is whole", async () => {
  mock.method(globalThis, "fetch", async () => Response.json({ items: [] }))
  mock.method(console, "error", () => {})
  await assert.rejects(listNotifications(apis, P04, 8, now), /The Events API answered in a shape this server does not know/)
})

test("hours outside what the list of machines looks at are refused in words", async () => {
  await assert.rejects(listNotifications(apis, P04, 25, now), /between 0 and 24 hours/)
})
