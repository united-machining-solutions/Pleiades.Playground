import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"

import { stateOf } from "@pleiades/cards/machine/state.ts"

import { silences } from "./liveness.ts"
import { currentRun, listMachines, machineOf, showMachine } from "./machines.ts"
import { fromMicroseconds } from "./time.ts"

const topic = "machines/P-04/umati/State/MachineryItemState"
const windowStart = "2026-11-16T09:00:00.000Z"
/** An instant that many seconds after the start of the window. */
const at = (seconds: number) => new Date(Date.parse(windowStart) + seconds * 1000).toISOString()
/** A value every five seconds, as a simulator publishes it. */
const every5s = (from: number, to: number, value: string) =>
  Array.from({ length: (to - from) / 5 + 1 }, (_, index) => ({ at: at(from + index * 5), value }))
/** The machine was there the whole time. */
const neverSilent = [] as const

test("the machine is the topic level after machines/", () => {
  assert.equal(machineOf(topic), "P-04")
  assert.equal(machineOf("machines/M-02/events/notifications"), "M-02")
  assert.equal(machineOf("somewhere/else"), undefined)
})

test("a run starts where the value last changed", () => {
  const samples = [
    ...every5s(0, 55, "Executing"),
    ...every5s(60, 115, "NotExecuting"),
    ...every5s(120, 180, "Executing"),
  ]
  assert.deepEqual(currentRun(topic, samples, neverSilent, true), {
    value: "Executing",
    at: at(180),
    since: at(120),
    sinceIsLowerBound: false,
    topic,
  })
})

test("a value that never changed in what was read has only a lower bound", () => {
  const run = currentRun(topic, every5s(-5, 180, "Executing"), neverSilent, true)
  assert.equal(run.since, at(-5))
  assert.equal(run.sinceIsLowerBound, true)
})

test("a value that is the first one there is has a since", () => {
  const run = currentRun(topic, every5s(1200, 1260, "Executing"), neverSilent, false)
  assert.equal(run.since, at(1200))
  assert.equal(run.sinceIsLowerBound, false)
})

test("a value published once holds, however long ago, and its change is its since", () => {
  const samples = [
    { at: at(-7200), value: "NotExecuting" },
    { at: at(-3600), value: "Executing" },
  ]
  assert.deepEqual(currentRun(topic, samples, neverSilent, true), {
    value: "Executing",
    at: at(-3600),
    since: at(-3600),
    sinceIsLowerBound: false,
    topic,
  })
})

test("a value that is announced again is the same run, while the machine is there", () => {
  const samples = [
    { at: at(-3600), value: "Executing" },
    { at: at(600), value: "Executing" },
  ]
  assert.equal(currentRun(topic, samples, neverSilent, false).since, at(-3600))
  assert.equal(currentRun(topic, samples, neverSilent, true).sinceIsLowerBound, true)
})

test("a silence of the machine ends a run, also if the value is the same after it", () => {
  const samples = [...every5s(0, 60, "Executing"), ...every5s(600, 660, "Executing")]
  const silent = silences(
    samples.map((sample) => sample.at),
    at(0),
    at(660),
  )
  const run = currentRun(topic, samples, silent, true)
  assert.equal(run.since, at(600))
  assert.equal(run.sinceIsLowerBound, false)
})

test("a machine that came back in the window has the first value after its silence as since", () => {
  // Its last value from before, hours ago, and what it publishes since it is back.
  const samples = [{ at: at(-7200), value: "Executing" }, ...every5s(1200, 1260, "Executing")]
  const silent = silences(
    every5s(1200, 1260, "Executing").map((sample) => sample.at),
    at(0),
    at(1260),
  )
  const run = currentRun(topic, samples, silent, true)
  assert.equal(run.since, at(1200))
  assert.equal(run.sinceIsLowerBound, false)
})

test("a topic without a value yields an empty reading that still names its topic", () => {
  assert.deepEqual(currentRun(topic, [], neverSilent, false), {
    value: null,
    at: null,
    since: null,
    sinceIsLowerBound: false,
    topic,
  })
})

test("microseconds since 1970 become ISO 8601 in UTC", () => {
  assert.equal(fromMicroseconds(1794321213106000), "2026-11-10T14:33:33.106Z")
})

type Published = Record<string, ReadonlyArray<{ at: string; value: string | number }>>

/**
 * The two APIs with what a test published, oldest first. They answer as the real ones do: only
 * with what lies between the two instants of a request, and with the newest values if it names
 * a limit. No notification was raised.
 */
function publishing(published: Published) {
  mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input))
    if (url.pathname === "/notificationEvents/correlationPairs") return Response.json({ items: [] })
    const start = Date.parse(url.searchParams.get("startTime") ?? "")
    const stop = Date.parse(url.searchParams.get("stopTime") ?? "")
    const between = (topic: string) =>
      (published[topic] ?? []).filter((one) => start <= Date.parse(one.at) && Date.parse(one.at) <= stop)
    const topics = Object.keys(published)
    const numbers = (topic: string) => typeof published[topic]?.[0]?.value === "number"
    if (url.pathname === "/topics") {
      const live = topics.filter((topic) => between(topic).length > 0)
      return Response.json({
        baseUnitTopics: live.filter(numbers),
        stringTopics: live.filter((topic) => !numbers(topic)),
      })
    }
    // A topic in the path: its levels, with * for any one of them.
    const [, kind = "", asked = ""] = /^\/timeseries\/(\w+)\/topics\/(.+)$/.exec(decodeURIComponent(url.pathname)) ?? []
    const levels = asked.split("/")
    const matches = (topic: string) => {
      const own = topic.split("/")
      return own.length === levels.length && own.every((level, index) => levels[index] === "*" || levels[index] === level)
    }
    const limit = Number(url.searchParams.get("limit") ?? Infinity)
    const series = topics
      .filter((topic) => matches(topic) && numbers(topic) === (kind === "baseUnitValues"))
      .map((topic) => {
        const samples = between(topic).slice(-limit)
        return {
          topic,
          timestamps: samples.map((one) => Date.parse(one.at) * 1000),
          values: samples.map((one) => one.value),
        }
      })
    return Response.json({ series })
  })
}

afterEach(() => mock.restoreAll())

const apis = { timeseriesUrl: "http://timeseries:8080", eventsUrl: "http://events:8080" }
const now = new Date("2026-11-16T09:30:00.000Z")
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString()
/** A heartbeat every ten seconds over that many hours, and nothing else. */
const heartbeats = (hours: number) =>
  Array.from({ length: hours * 360 + 1 }, (_, index) => ({
    at: new Date(now.getTime() - (hours * 360 - index) * 10_000).toISOString(),
    value: index,
  }))

test("a state that was reported more than a day ago holds, as long as the machine gives signs of life", async () => {
  // A machine that has run for 25 hours: it said once that it is connected and what it does.
  publishing({
    "machines/P-04/umati/Connection/State": [{ at: hoursAgo(25), value: "Connected" }],
    "machines/P-04/umati/State/MachineryItemState": [{ at: hoursAgo(25), value: "Executing" }],
    "machines/P-04/umati/State/MachineryOperationMode": [{ at: hoursAgo(25), value: "Automatic" }],
    "machines/P-04/umati/Connection/Heartbeat": heartbeats(9),
  })

  const list = await listMachines(apis, now)
  const [machine] = list.machines
  assert.equal(list.machines.length, 1)
  assert.equal(machine?.connection.value, "Connected")
  assert.equal(machine?.itemState.since, hoursAgo(25))
  assert.equal(machine && stateOf(machine, list.asOf), "running")

  // The history says the same about every hour of it.
  const shown = await showMachine(apis, "P-04", 8, now)
  assert.deepEqual(shown.history.totals, [{ state: "running", seconds: 8 * 3600 }])
})

test("a serial number is what the MQTT binding allows, so a machine that is listed can be shown", async () => {
  assert.equal(machineOf("machines/Line 2/umati/Connection/State"), "Line 2")
  // What the binding forbids names no machine.
  assert.equal(machineOf("machines/a+b/umati/Connection/State"), undefined)
  assert.equal(machineOf("machines/a#b/umati/Connection/State"), undefined)

  publishing({
    "machines/Line 2/umati/Connection/State": [{ at: hoursAgo(1), value: "Connected" }],
    "machines/Line 2/umati/Connection/Heartbeat": heartbeats(1),
  })
  const list = await listMachines(apis, now)
  assert.deepEqual(
    list.machines.map((one) => one.machine),
    ["Line 2"],
  )
  const shown = await showMachine(apis, "Line 2", 1, now)
  assert.equal(shown.machine.connection.value, "Connected")
})

test("a machine whose heartbeat stopped has no data, whatever it reported before", async () => {
  publishing({
    "machines/P-04/umati/Connection/State": [{ at: hoursAgo(25), value: "Connected" }],
    "machines/P-04/umati/State/MachineryItemState": [{ at: hoursAgo(25), value: "Executing" }],
    // The last sign of life is an hour old.
    "machines/P-04/umati/Connection/Heartbeat": [{ at: hoursAgo(1), value: 1 }],
  })
  const list = await listMachines(apis, now)
  const [machine] = list.machines
  assert.equal(machine?.connection.value, "Connected")
  assert.equal(machine && stateOf(machine, list.asOf), "no-data")
})
