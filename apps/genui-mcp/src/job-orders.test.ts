import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"

import { listJobOrders } from "./job-orders.ts"

const apis = { timeseriesUrl: "http://timeseries:8080", eventsUrl: "http://events:8080" }
const now = new Date("2026-11-18T10:00:00.000Z")

/** An Events API that holds `items`, and a Timeseries API that names the machines that published a value. */
function answering(items: Array<Record<string, unknown>>, machines: Array<string> = ["m1"]) {
  const requested: Array<URL> = []
  mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input))
    if (url.pathname === "/topics") {
      return Response.json({ baseUnitTopics: machines.map((machine) => `machines/${machine}/umati/Connection/Heartbeat`) })
    }
    requested.push(url)
    return Response.json({ items })
  })
  return requested
}

afterEach(() => mock.restoreAll())

const stored = (more: Record<string, unknown>) => ({
  mId: "m1",
  jobOrderId: "1/01",
  state: "Running",
  lastChange: "2026-11-18T09:00:00Z",
  removed: false,
  ...more,
})

test("the job orders of the last 24 hours are asked for, of one machine if one is named", async () => {
  const requested = answering([])
  await listJobOrders(apis, "m1", now)
  assert.equal(requested[0]?.pathname, "/jobOrders")
  assert.equal(requested[0]?.searchParams.get("from"), "2026-11-17T10:00:00.000Z")
  assert.equal(requested[0]?.searchParams.get("to"), "2026-11-18T10:00:00.000Z")
  assert.equal(requested[0]?.searchParams.get("mId"), "m1")
})

test("one machine is named as people call it, and asked for under its id", async () => {
  const requested = answering([], ["alcyone-machines_AX-400_P-04", "taygeta-precision_TP-800_P-07"])
  await listJobOrders(apis, "P-07", now)
  assert.equal(requested[0]?.searchParams.get("mId"), "taygeta-precision_TP-800_P-07")
})

test("a job order that left the list of its machine is left out", async () => {
  answering([stored({}), stored({ jobOrderId: "1/02", removed: true })])
  const list = await listJobOrders(apis, undefined, now)
  assert.deepEqual(
    list.jobOrders.map((one) => one.jobOrderId),
    ["1/01"],
  )
})

test("instants are written in one form, so they compare as text", async () => {
  answering([
    stored({ jobOrderId: "a", lastChange: "2026-11-18T08:00:00.5Z", startTime: "2026-11-18T09:00:00+01:00" }),
    stored({ jobOrderId: "b", lastChange: "2026-11-18T08:00:00Z" }),
  ])
  const list = await listJobOrders(apis, undefined, now)
  assert.deepEqual(
    list.jobOrders.map((one) => [one.jobOrderId, one.changedAt]),
    [
      ["b", "2026-11-18T08:00:00.000Z"],
      ["a", "2026-11-18T08:00:00.500Z"],
    ],
  )
  assert.equal(list.jobOrders[1]?.start, "2026-11-18T08:00:00.000Z")
})

test("an empty order number is no order number", async () => {
  answering([stored({ orderNumbers: ["", " ", "SO-1"] })])
  const list = await listJobOrders(apis, undefined, now)
  assert.deepEqual(list.jobOrders[0]?.orderNumbers, ["SO-1"])
})
