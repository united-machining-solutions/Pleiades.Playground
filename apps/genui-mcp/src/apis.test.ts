import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"

import { inPath, listTopics, readNewest, readOpenNotifications, readStatistics, readStrings, readTimelines } from "./apis.ts"

const apis = { timeseriesUrl: "http://timeseries:8080", eventsUrl: "http://events:8080" }
const from = new Date("2026-11-16T09:00:00.000Z")
const to = new Date("2026-11-16T09:30:00.000Z")

/** Every request is answered by `answer`; what failed is logged, and the test keeps the log quiet. */
function answering(answer: (url: URL) => Response | Promise<Response>) {
  const requested: Array<URL> = []
  mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input))
    requested.push(url)
    return answer(url)
  })
  const logged = mock.method(console, "error", () => {})
  return { requested, logged }
}

afterEach(() => mock.restoreAll())

test("a topic keeps its levels and its wildcard in a URL, and nothing else of it ends the path", () => {
  assert.equal(inPath("machines/P-04/umati/Connection/State"), "machines/P-04/umati/Connection/State")
  assert.equal(inPath("machines/*/umati/Connection/State"), "machines/*/umati/Connection/State")
  assert.equal(inPath("machines/Line 2?/umati/a#b"), "machines/Line%202%3F/umati/a%23b")
})

test("the values of a topic are asked for under its encoded path", async () => {
  const { requested } = answering(() => Response.json({ series: [] }))
  await readStrings(apis, "machines/Line 2?/umati/Connection/State", from, to)
  assert.equal(requested[0]?.pathname, "/timeseries/stringValues/topics/machines/Line%202%3F/umati/Connection/State")
  assert.equal(requested[0]?.searchParams.get("startTime"), "2026-11-16T09:00:00.000Z")
})

test("an API that is not there is named, with the reason, and logged", async () => {
  const { logged } = answering(() => {
    throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } })
  })
  await assert.rejects(
    listTopics(apis, from, to),
    /^Error: The Timeseries API did not answer: ECONNREFUSED \(http:\/\/timeseries:8080\/topics\)\.$/,
  )
  assert.equal(logged.mock.callCount(), 1)
})

test("an API that answers with an error is named, with the status", async () => {
  answering(() => new Response("no", { status: 503 }))
  await assert.rejects(
    readOpenNotifications(apis, from, to),
    /^Error: The Events API answered 503 \(http:\/\/events:8080\/alerts\/pairs\)\.$/,
  )
})

test("an answer in another shape is named as such, not passed on", async () => {
  const { logged } = answering(() => Response.json({ series: "none" }))
  await assert.rejects(readStrings(apis, "machines/P-04/x", from, to), /The Timeseries API answered in a shape/)
  assert.equal(logged.mock.callCount(), 1)

  answering(() => new Response("<html>", { status: 200 }))
  await assert.rejects(listTopics(apis, from, to), /The Timeseries API did not answer/)
})

test("the newest value, or the first after a start: one reader, the sorting says which", async () => {
  const { requested } = answering(() =>
    Response.json({ series: [{ topic: "machines/P-04/x", unit: "watt", timestamps: [Date.parse("2026-11-16T09:01:00.000Z") * 1000], values: [5] }] }),
  )
  assert.deepEqual(await readNewest(apis, "baseUnitValues", "machines/P-04/x", to), { at: "2026-11-16T09:01:00.000Z", value: 5, unit: "watt" })
  await readNewest(apis, "baseUnitValues", "machines/P-04/x", to, { from, sorting: "Ascending" })
  assert.deepEqual(
    requested.map((url) => [url.searchParams.get("startTime"), url.searchParams.get("sorting"), url.searchParams.get("limit")]),
    [
      ["1970-01-01T00:00:00.000Z", "Descending", "1"],
      ["2026-11-16T09:00:00.000Z", "Ascending", "1"],
    ],
  )
})

test("the values of a topic, whole or thinned to a number of points: one reader", async () => {
  const { requested } = answering(() => Response.json({ series: [] }))
  await readTimelines(apis, "baseUnitValues", "machines/P-04/x", from, to)
  await readTimelines(apis, "baseUnitValues", "machines/P-04/x", from, to, 480)
  assert.deepEqual(
    requested.map((url) => [url.searchParams.get("downsample"), url.searchParams.get("limit")]),
    [
      [null, null],
      ["true", "480"],
    ],
  )
})

test("the statistics are asked for with a POST and fail as every other request does", async () => {
  const sent: Array<RequestInit | undefined> = []
  mock.method(globalThis, "fetch", async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    sent.push(init)
    return new Response("no", { status: 503 })
  })
  mock.method(console, "error", () => {})
  await assert.rejects(
    readStatistics(apis, "machines/*/x", from, to),
    /^Error: The Timeseries API answered 503 \(http:\/\/timeseries:8080\/statistics\/baseUnitValues\/topics\/machines%2F\*%2Fx\)\.$/,
  )
  assert.equal(sent[0]?.method, "POST")
  assert.deepEqual(JSON.parse(String(sent[0]?.body)), [{ start: from.toISOString(), stop: to.toISOString() }])
  assert.ok(sent[0]?.signal instanceof AbortSignal)
})
