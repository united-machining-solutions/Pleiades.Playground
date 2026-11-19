import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"

import { jobOrderShow, jobOrderTimeline } from "@pleiades/cards/joborder/contract.ts"

import { endOf, listJobOrderTimeline, showJobOrder } from "./job-order-history.ts"

const apis = { timeseriesUrl: "http://timeseries:8080", eventsUrl: "http://events:8080" }
const now = new Date("2026-11-18T10:00:00.000Z")
const machine = "alcyone-machines_AX-400_P-04"

/** The Events API with these job orders and program executions, and the starts of the adapter in the Timeseries API. */
function answering(jobOrders: Array<Record<string, unknown>>, executions: Array<Record<string, unknown>>, starts: Array<string> = []) {
  const requested: Array<URL> = []
  mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input))
    requested.push(url)
    if (url.pathname === "/topics") return Response.json({ baseUnitTopics: [`machines/${machine}/umati/Connection/Heartbeat`] })
    // As the Events API does: a job order by its last change between the two instants.
    if (url.pathname === "/jobOrders") {
      const [from, to] = [Date.parse(url.searchParams.get("from")!), Date.parse(url.searchParams.get("to")!)]
      return Response.json({ items: jobOrders.filter((one) => Date.parse(String(one.lastChange)) >= from && Date.parse(String(one.lastChange)) <= to) })
    }
    if (url.pathname === "/programExecutions") return Response.json({ items: executions, hasMore: false })
    // The state of the connection between the two instants, as the Timeseries API returns text.
    const topic = `machines/${machine}/umati/Connection/State`
    const [from, to] = [Date.parse(url.searchParams.get("startTime")!), Date.parse(url.searchParams.get("stopTime")!)]
    const within = starts.map(Date.parse).filter((at) => at >= from && at <= to)
    return Response.json({
      series: [{ topic, timestamps: within.map((at) => at * 1000), values: within.map(() => "Initializing") }],
    })
  })
  return requested
}

afterEach(() => mock.restoreAll())

const job = (more: Record<string, unknown>) => ({
  mId: machine,
  jobOrderId: "4711/01",
  state: "Running",
  lastChange: "2026-11-18T09:00:00Z",
  removed: false,
  startTime: "2026-11-18T08:00:00Z",
  ...more,
})
const run = (more: Record<string, unknown>) => ({
  mId: machine,
  executionId: "e1",
  jobOrderId: "4711/01",
  workMasterId: "WM-1",
  state: "Ended",
  startTime: "2026-11-18T08:00:00Z",
  endTime: "2026-11-18T08:30:00Z",
  endType: "Ended",
  duration: 1800,
  interruptions: 0,
  ...more,
})

test("something that never ended runs until the next start of the adapter, else on", () => {
  const starts = [Date.parse("2026-11-18T09:30:00Z")]
  assert.equal(endOf("2026-11-18T09:00:00.000Z", "2026-11-18T08:00:00Z", starts), Date.parse("2026-11-18T09:00:00Z"))
  assert.equal(endOf(null, "2026-11-18T08:00:00Z", starts), Date.parse("2026-11-18T09:30:00Z"))
  assert.equal(endOf(null, "2026-11-18T09:45:00Z", starts), Infinity)
})

test("the card shows the job order that runs and the program execution that runs, by the names of the data model", async () => {
  answering(
    [job({}), job({ jobOrderId: "4711/00", state: "Ended", lastChange: "2026-11-18T07:00:00Z", endTime: "2026-11-18T07:00:00Z" })],
    [run({}), run({ executionId: "e2", workMasterId: "WM-2", state: "Running", startTime: "2026-11-18T09:00:00Z", endTime: null, duration: null })],
  )
  const shown = await showJobOrder(apis, machine, 8, now)
  assert.ok(jobOrderShow.safeParse(shown).success)
  assert.equal(shown.jobOrder?.jobOrderId, "4711/01")
  assert.equal(shown.programExecution?.ExecutionId, "e2")
  assert.equal(shown.programExecution?.ActiveWorkMaster, "WM-2")
  assert.equal(shown.jobOrders, 2)
  assert.equal(shown.programExecutions, 2)
  assert.equal(shown.from, "2026-11-18T02:00:00.000Z")
})

test("a job order left open by an earlier run of the adapter is not the one that runs", async () => {
  answering(
    [job({ lastChange: "2026-11-18T08:00:00Z" }), job({ jobOrderId: "4712/01", state: "Ended", lastChange: "2026-11-18T09:50:00Z" })],
    [],
    ["2026-11-18T09:00:00Z"],
  )
  const shown = await showJobOrder(apis, machine, 8, now)
  assert.equal(shown.jobOrder?.jobOrderId, "4712/01")
})

test("the timeline clips each span to the hours and says which run on", async () => {
  answering(
    [job({ startTime: "2026-11-18T07:00:00Z" })],
    [run({}), run({ executionId: "e2", state: "Running", startTime: "2026-11-18T09:00:00Z", endTime: null, duration: null })],
  )
  const timeline = await listJobOrderTimeline(apis, machine, "2026-11-18T08:15:00.000Z", now.toISOString())
  assert.ok(jobOrderTimeline.safeParse(timeline).success)
  assert.equal(timeline.jobOrders[0]?.from, "2026-11-18T08:15:00.000Z")
  assert.equal(timeline.jobOrders[0]?.open, true)
  assert.deepEqual(
    timeline.programExecutions.map((one) => [one.label, one.from, one.to, one.open]),
    [
      ["WM-1", "2026-11-18T08:15:00.000Z", "2026-11-18T08:30:00.000Z", false],
      ["WM-1", "2026-11-18T09:00:00.000Z", "2026-11-18T10:00:00.000Z", true],
    ],
  )
})

test("a program execution left open by an earlier run of the adapter is not shown as the one that runs", async () => {
  answering(
    [],
    [run({}), run({ executionId: "e2", state: "Running", startTime: "2026-11-18T09:00:00Z", endTime: null, duration: null })],
    ["2026-11-18T09:30:00Z"],
  )
  const shown = await showJobOrder(apis, machine, 8, now)
  assert.equal(shown.programExecution?.ExecutionId, "e1")
  assert.equal(shown.programExecution?.State, "Ended")
})

test("the timeline keeps a job order that changed after the timeline ends, as the one that runs does a moment after a card asked", async () => {
  answering([job({ startTime: "2026-11-18T08:00:00Z", lastChange: "2026-11-18T09:45:00Z" })], [])
  const timeline = await listJobOrderTimeline(apis, machine, "2026-11-18T08:15:00.000Z", "2026-11-18T09:30:00.000Z", now)
  assert.deepEqual(
    timeline.jobOrders.map((one) => [one.id, one.from, one.to, one.open]),
    [["4711/01", "2026-11-18T08:15:00.000Z", "2026-11-18T09:30:00.000Z", true]],
  )
})

test("a job order taken off the list without an end stands until it was taken off", async () => {
  answering([job({ startTime: "2026-11-18T08:00:00Z", lastChange: "2026-11-18T09:00:00Z", removed: true })], [])
  const timeline = await listJobOrderTimeline(apis, machine, "2026-11-18T08:15:00.000Z", now.toISOString(), now)
  assert.deepEqual(
    timeline.jobOrders.map((one) => [one.from, one.to, one.open]),
    [["2026-11-18T08:15:00.000Z", "2026-11-18T09:00:00.000Z", false]],
  )
})

test("the count takes every job order on the list in the hours, one that waits since before them too", async () => {
  answering(
    [
      job({}),
      // Waiting since the evening before, no event since.
      job({ jobOrderId: "4712/01", state: "AllowedToStart", firstSeen: "2026-11-17T20:00:00Z", lastChange: "2026-11-17T20:00:00Z", startTime: null }),
      // Taken off the list before the hours.
      job({ jobOrderId: "4710/01", state: "Ended", firstSeen: "2026-11-17T20:30:00Z", startTime: "2026-11-17T21:00:00Z", endTime: "2026-11-17T22:00:00Z", lastChange: "2026-11-18T01:00:00Z", removed: true }),
    ],
    [],
  )
  const shown = await showJobOrder(apis, machine, 8, now)
  assert.equal(shown.jobOrders, 2)
  assert.equal(shown.jobOrder?.jobOrderId, "4711/01")
})

test("a job order interrupted for longer than a day still stands, unless the adapter started again since", async () => {
  const interrupted = job({ state: "Interrupted", startTime: "2026-11-16T08:00:00Z", lastChange: "2026-11-16T18:00:00Z" })
  answering([interrupted], [])
  const standing = await showJobOrder(apis, machine, 8, now)
  assert.equal(standing.jobOrder?.state, "Interrupted")
  assert.equal(standing.jobOrders, 1)
  const timeline = await listJobOrderTimeline(apis, machine, standing.from, standing.asOf, now)
  assert.deepEqual(
    timeline.jobOrders.map((one) => [one.from, one.to, one.open]),
    [["2026-11-18T02:00:00.000Z", "2026-11-18T10:00:00.000Z", true]],
  )

  mock.restoreAll()
  answering([interrupted], [], ["2026-11-16T20:00:00Z"])
  const gone = await showJobOrder(apis, machine, 8, now)
  assert.equal(gone.jobOrders, 0)
  assert.deepEqual((await listJobOrderTimeline(apis, machine, gone.from, gone.asOf, now)).jobOrders, [])
})

test("a program execution counts as aborted by how it ended, also where its end carries no State", async () => {
  answering(
    [],
    [run({}), run({ executionId: "e2", state: "", endType: "Aborted", startTime: "2026-11-18T09:00:00Z", endTime: "2026-11-18T09:10:00Z" })],
  )
  const shown = await showJobOrder(apis, machine, 8, now)
  assert.equal(shown.programExecutions, 2)
  assert.equal(shown.aborted, 1)
})

test("1000 job orders are only a lower bound where the oldest of them changed in the day before the hours", async () => {
  const newestFirst = (oldest: string) =>
    Array.from({ length: 1000 }, (_, index) =>
      job({ jobOrderId: `J-${index}`, state: "Ended", removed: true, lastChange: new Date(Date.parse(oldest) + (999 - index) * 1000).toISOString() }),
    )
  answering(newestFirst("2026-11-18T03:00:00Z"), [])
  assert.equal((await showJobOrder(apis, machine, 8, now)).hasMore, true)
  mock.restoreAll()
  answering([...newestFirst("2026-11-18T03:00:00Z").slice(0, 999), job({ jobOrderId: "old", state: "Ended", lastChange: "2026-11-10T00:00:00Z" })], [])
  assert.equal((await showJobOrder(apis, machine, 8, now)).hasMore, false)
})

test("a timeline longer than a day is refused", async () => {
  answering([], [])
  await assert.rejects(listJobOrderTimeline(apis, machine, "2026-11-16T10:00:00.000Z", now.toISOString()), /24 hours/)
})
