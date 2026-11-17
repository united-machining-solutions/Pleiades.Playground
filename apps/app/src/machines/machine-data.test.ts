import assert from "node:assert/strict"
import { createServer, type IncomingMessage, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { after, before, test } from "node:test"

import { apiUrls, deleteMachineData, invalidSerialNumber } from "./machine-data.ts"

// Two fake APIs on this computer: they note each request and answer as the real ones do, or fail.
const requests: Array<string> = []
let fail: "timeseries" | "events" | undefined
let timeseries: Server
let events: Server

function api(name: "timeseries" | "events", body: object): Server {
  return createServer((request: IncomingMessage, response) => {
    requests.push(`${name} ${request.method} ${request.url}`)
    if (fail === name) {
      response.writeHead(500).end()
      return
    }
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body))
  })
}

const listen = (server: Server) =>
  new Promise<string>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)),
  )

let env: NodeJS.ProcessEnv
before(async () => {
  timeseries = api("timeseries", { valuesCount: 19257 })
  events = api("events", { eventsCount: 864 })
  env = { TIMESERIES_API_URL: `${await listen(timeseries)}/`, EVENTS_API_URL: await listen(events) }
})
after(() => {
  timeseries.close()
  events.close()
})

test("unset, the APIs are those of the stack on this computer; a trailing slash is dropped", () => {
  assert.deepEqual(apiUrls({}), { timeseries: "http://localhost:5500", events: "http://localhost:5510" })
  assert.deepEqual(apiUrls({ TIMESERIES_API_URL: "http://timeseries-api:8080/", EVENTS_API_URL: " " }), {
    timeseries: "http://timeseries-api:8080",
    events: "http://localhost:5510",
  })
})

test("a serial number is one level of a topic", () => {
  assert.equal(invalidSerialNumber("A0280E0062"), undefined)
  assert.equal(invalidSerialNumber("Line 2?"), undefined)
  for (const wrong of ["", " ", "a/b", "a+b", "a#b"]) assert.ok(invalidSerialNumber(wrong), wrong)
})

test("deletes the values, then the notifications, and says how many of each", async () => {
  requests.length = 0
  fail = undefined
  assert.deepEqual(await deleteMachineData("Line 2?", env), { ok: true, values: 19257, events: 864 })
  assert.deepEqual(requests, [
    "timeseries DELETE /machines/Line%202%3F",
    "events DELETE /notificationEvents/machines/Line%202%3F",
  ])
})

test("if the values cannot be deleted, the notifications are not touched", async () => {
  requests.length = 0
  fail = "timeseries"
  const outcome = await deleteMachineData("P-04", env)
  assert.deepEqual(outcome, { ok: false, reason: "The Timeseries API answered 500." })
  assert.equal(requests.length, 1)
})

test("if only the notifications fail, the reason says the values are gone", async () => {
  fail = "events"
  const outcome = await deleteMachineData("P-04", env)
  assert.equal(outcome.ok, false)
  assert.match(!outcome.ok ? outcome.reason : "", /^The values are deleted, the notifications are not\. The Events API answered 500\.$/)
})

test("an API that does not answer is named", async () => {
  fail = undefined
  // A port that was just free: nothing answers there.
  const gone = createServer()
  const url = await listen(gone)
  await new Promise((resolve) => gone.close(resolve))
  const outcome = await deleteMachineData("P-04", { TIMESERIES_API_URL: url, EVENTS_API_URL: env.EVENTS_API_URL })
  assert.equal(outcome.ok, false)
  assert.match(!outcome.ok ? outcome.reason : "", /^The Timeseries API did not answer: ECONNREFUSED\.$/)
})
