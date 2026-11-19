import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"

import { silences } from "./liveness.ts"
import { listMeasurementSeries, listMeasurements, measurementOf, slotEnds, slotted } from "./measurements.ts"

const apis = { timeseriesUrl: "http://timeseries:8080", eventsUrl: "http://events:8080" }
const now = new Date("2026-11-16T09:30:00.000Z")
// The Timeseries API counts microseconds since 1970.
const micros = (instant: string) => Date.parse(instant) * 1000
/** The instant so many seconds before `now`. */
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString()
/** A sign of life every ten seconds, from so many seconds before `now` to so many. */
const every10s = (from: number, to: number) =>
  Array.from({ length: Math.floor((from - to) / 10) + 1 }, (_, index) => ago(from - index * 10))

afterEach(() => mock.restoreAll())

type Stored = { at: string; value: number | boolean; unit?: string }

/**
 * A Timeseries API that holds `store`, a list of values for each topic. It answers a topic with
 * `*`, a stretch of time, and the newest values in descending order, as the real one does.
 */
function serve(store: Record<string, Array<Stored>>): Array<URL> {
  const requested: Array<URL> = []
  mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input))
    requested.push(url)
    if (url.pathname === "/topics") {
      return Response.json({ baseUnitTopics: Object.keys(store), stringTopics: [], booleanTopics: [] })
    }
    const pattern = decodeURIComponent(url.pathname.replace(/^\/timeseries\/\w+\/topics\//, ""))
    const escaped = pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    const matches = new RegExp(`^${escaped.join("[^/]+")}$`)
    const start = url.searchParams.get("startTime") ?? ""
    const stop = url.searchParams.get("stopTime") ?? ""
    const series = Object.entries(store)
      .filter(([topic]) => matches.test(topic))
      .map(([topic, samples]) => {
        let picked = samples.filter((one) => one.at >= start && one.at <= stop).sort((a, b) => a.at.localeCompare(b.at))
        if (url.searchParams.get("sorting") === "Descending") {
          picked = picked.reverse().slice(0, Number(url.searchParams.get("limit") ?? picked.length))
        }
        return {
          topic,
          unit: samples[0]?.unit,
          timestamps: picked.map((one) => micros(one.at)),
          values: picked.map((one) => one.value),
        }
      })
      .filter((one) => one.timestamps.length > 0)
    return Response.json({ series })
  })
  return requested
}

const heartbeat = (machine: string, from: number, to: number) => ({
  [`machines/${machine}/umati/Connection/Heartbeat`]: every10s(from, to).map((at, index) => ({ at, value: index })),
})

test("a value holds for as long as the machine gives signs of life, however old it is", () => {
  const value = { at: ago(600), value: 1, unit: "watt" }
  const from = ago(1800)
  const there = silences([ago(1830), ...every10s(1800, 0), value.at], from, now.toISOString())
  assert.equal(measurementOf("t", "activePower", value, there, now).stale, false)
  // The machine fell silent five minutes ago: what it measures now is not known.
  const gone = silences([...every10s(1800, 300), value.at], from, now.toISOString())
  assert.equal(measurementOf("t", "activePower", value, gone, now).stale, true)
  // Back again after a silence, with no new value: the old one is not current either.
  const back = silences([...every10s(1800, 400), ...every10s(200, 0), value.at], from, now.toISOString())
  assert.equal(measurementOf("t", "activePower", value, back, now).stale, true)
  assert.deepEqual(measurementOf("t", "activePower", null, there, now), {
    quantity: "activePower",
    value: null,
    unit: null,
    at: null,
    stale: true,
    topic: "t",
  })
})

test("every machine gets each quantity from the newest value of its topic, in the unit it was stored in", async () => {
  const requested = serve({
    ...heartbeat("P-04", 1900, 0),
    "machines/P-04/umati/Consumption/Electricity/Main/AcActivePowerTotal": [{ at: ago(2), value: 2410.5, unit: "watt" }],
    // Published only when it changes: ten minutes ago, and it still holds.
    "machines/P-04/umati/Spindle/1/IsRotating": [{ at: ago(600), value: true }],
    // M-02 fell silent an hour ago.
    ...heartbeat("M-02", 4000, 3600),
    "machines/M-02/umati/Consumption/Electricity/Main/AcActivePowerTotal": [{ at: ago(3610), value: 980, unit: "watt" }],
  })

  const list = await listMeasurements(apis, now)
  assert.deepEqual(
    list.machines.map((one) => one.machine),
    ["M-02", "P-04"],
  )
  const p04 = list.machines.find((one) => one.machine === "P-04")
  assert.deepEqual(
    p04?.measurements.map((one) => one.quantity),
    ["activePower", "energyImported", "bearingTemperature", "spindleRotating", "feedOverride", "spindleOverride", "powerOnDuration"],
  )
  assert.deepEqual(p04?.measurements[0], {
    quantity: "activePower",
    value: 2410.5,
    unit: "watt",
    at: ago(2),
    stale: false,
    topic: "machines/P-04/umati/Consumption/Electricity/Main/AcActivePowerTotal",
  })
  assert.equal(p04?.measurements[3]?.value, true)
  assert.equal(p04?.measurements[3]?.unit, null)
  assert.equal(p04?.measurements[3]?.stale, false)
  assert.equal(p04?.measurements[1]?.value, null)
  assert.equal(p04?.measurements[1]?.stale, true)
  const m02 = list.machines.find((one) => one.machine === "M-02")
  assert.equal(m02?.measurements[0]?.value, 980)
  assert.equal(m02?.measurements[0]?.stale, true)

  // The newest value only, however old: one, in descending order, from the beginning.
  const read = requested.find((url) => url.pathname.endsWith("P-04/umati/Consumption/Electricity/Main/AcActivePowerTotal"))
  assert.equal(read?.pathname.startsWith("/timeseries/baseUnitValues/"), true)
  assert.equal(read?.searchParams.get("limit"), "1")
  assert.equal(read?.searchParams.get("sorting"), "Descending")
  assert.equal(read?.searchParams.get("startTime"), "1970-01-01T00:00:00.000Z")
  assert.equal(
    requested.some((url) => url.pathname === "/timeseries/booleanValues/topics/machines/P-04/umati/Spindle/1/IsRotating"),
    true,
  )
})

test("with a machine the list holds that one only, and an unknown one is refused in words", async () => {
  const requested = serve({
    ...heartbeat("P-04", 1900, 0),
    ...heartbeat("P-07", 1900, 0),
  })
  const list = await listMeasurements(apis, now, "P-07")
  assert.deepEqual(
    list.machines.map((one) => one.machine),
    ["P-07"],
  )
  assert.equal(requested.some((url) => url.pathname.includes("/machines/P-04/")), false)
  await assert.rejects(listMeasurements(apis, now, "X-99"), /No machine "X-99" published a value in the last 24 hours. Machines that did: P-04, P-07./)
})

test("a line shows at the end of each slot the value that held, as it was measured, and none while the machine is silent", () => {
  const from = new Date("2026-11-16T09:00:00.000Z")
  const to = new Date("2026-11-16T09:02:00.000Z")
  const at = (second: number) => new Date(from.getTime() + second * 1000).toISOString()
  const instants = slotEnds(from, to, 12)
  const slots = (points: Array<{ at: string; value: boolean }>, signs: Array<string>) =>
    slotted(points, instants, silences(signs, from.toISOString(), to.toISOString())).map((value, index) => [
      instants[index]?.slice(14, 19),
      value,
    ])
  const points = [
    { at: at(3), value: true },
    { at: at(8), value: false },
    { at: at(12), value: true },
  ]
  // Twelve slots of ten seconds. Without other signs of life the value of 12 holds until 42: then
  // the machine is silent, and nothing is known.
  assert.deepEqual(slots(points, points.map((one) => one.at)), [
    ["00:10", false],
    ["00:20", true],
    ["00:30", true],
    ["00:40", true],
    ["00:50", null],
    ["01:00", null],
    ["01:10", null],
    ["01:20", null],
    ["01:30", null],
    ["01:40", null],
    ["01:50", null],
    ["02:00", null],
  ])
  // A heartbeat every ten seconds keeps the machine there: a value published once holds to the end.
  const beats = Array.from({ length: 13 }, (_, index) => at(index * 10))
  assert.deepEqual(
    slots([{ at: at(3), value: true }], beats).map(([, value]) => value),
    [true, true, true, true, true, true, true, true, true, true, true, true],
  )
  // The last sign at 30 keeps the machine there until 60. After that silence the old value does not
  // come back with the heartbeat at 80: nothing is known until the next value.
  const gap = beats.filter((one) => one <= at(30) || one >= at(80))
  assert.deepEqual(
    slots([{ at: at(3), value: true }, { at: at(105), value: false }], gap).map(([, value]) => value),
    [true, true, true, true, true, true, null, null, null, null, false, false],
  )
  assert.deepEqual(slotted([], slotEnds(from, to, 4), []), [null, null, null, null])
})

test("the series give a line for each machine and quantity, from the value that held where they begin", async () => {
  const temperature = (machine: string) => `machines/${machine}/oem/Spindle/1/BearingTemperature`
  const requested = serve({
    ...heartbeat("P-04", 960, 0),
    ...heartbeat("P-07", 960, 0),
    [temperature("P-04")]: [
      { at: ago(120), value: 45, unit: "degreeCelsius" },
      { at: ago(30), value: 46, unit: "degreeCelsius" },
    ],
    [temperature("P-07")]: [{ at: ago(15), value: 47.5, unit: "degreeCelsius" }],
    // Published only when it changes, half an hour before the lines begin.
    "machines/P-07/umati/Spindle/1/IsRotating": [{ at: ago(2700), value: true }],
  })

  const series = await listMeasurementSeries(apis, 15, 180, now)
  assert.equal(series.from, "2026-11-16T09:15:00.000Z")
  assert.equal(series.to, now.toISOString())
  const temperatures = series.quantities.find((one) => one.quantity === "bearingTemperature")
  assert.equal(temperatures?.unit, "degreeCelsius")
  assert.deepEqual(
    temperatures?.lines.map((line) => line.machine),
    ["P-04", "P-07"],
  )
  // The instants stand once: the end of each slot of five seconds. Every line has a value for each.
  assert.equal(series.instants.length, 180)
  assert.equal(series.instants[0], "2026-11-16T09:15:05.000Z")
  assert.equal(series.instants.at(-1), now.toISOString())
  const [p04, p07] = temperatures?.lines ?? []
  assert.equal(p04?.values.length, 180)
  assert.equal(p07?.values.length, 180)
  const at = (instant: string) => series.instants.indexOf(instant)
  assert.equal(p04?.values.at(-1), 46)
  // 45 holds for the 90 seconds until 46: the heartbeat says the machine was there.
  assert.equal(p04?.values[at(ago(60))], 45)
  assert.equal(p04?.values[at(ago(300))], null)
  assert.equal(p07?.values.at(-1), 47.5)
  // The spindle of P-07 rotates since before the lines begin.
  const rotating = series.quantities.find((one) => one.quantity === "spindleRotating")
  assert.deepEqual(
    rotating?.lines.map((line) => line.machine),
    ["P-07"],
  )
  assert.equal(rotating?.lines[0]?.values.every((value) => value === true), true)
  assert.deepEqual(series.quantities.find((one) => one.quantity === "activePower")?.lines, [])
  // One request for each quantity over all machines at once, and the value that held before, for each machine.
  const timelines = requested.filter((url) => url.pathname.includes("/topics/machines/*/") && !url.pathname.endsWith("Heartbeat"))
  assert.equal(timelines.filter((url) => url.searchParams.get("startTime") === series.from).length, 7)
  const held = requested.filter((url) => url.searchParams.get("sorting") === "Descending")
  assert.equal(held.length, 14)
  assert.equal(held.every((url) => url.searchParams.get("stopTime") === series.from), true)
})

test("a topic below the path of a machine is not a line of that machine", async () => {
  mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input))
    // The wildcard of the Timeseries API reaches over several levels.
    if (url.pathname.endsWith("Spindle/1/Override")) {
      return Response.json({
        series: [
          { topic: "machines/P-04/umati/Spindle/1/Override", unit: "one", timestamps: [micros("2026-11-16T09:29:50.000Z")], values: [0.95] },
          { topic: "machines/P-04/extra/umati/Spindle/1/Override", unit: "one", timestamps: [micros("2026-11-16T09:29:50.000Z")], values: [0.5] },
        ],
      })
    }
    return Response.json({ series: [] })
  })

  const series = await listMeasurementSeries(apis, 15, 180, now)
  const override = series.quantities.find((one) => one.quantity === "spindleOverride")
  assert.deepEqual(override?.lines.map((line) => line.topic), ["machines/P-04/umati/Spindle/1/Override"])
})
test("the series of one machine read nothing of another", async () => {
  const temperature = (machine: string) => `machines/${machine}/oem/Spindle/1/BearingTemperature`
  const requested = serve({
    ...heartbeat("P-04", 960, 0),
    ...heartbeat("P-07", 960, 0),
    [temperature("P-04")]: [{ at: ago(30), value: 46, unit: "degreeCelsius" }],
    [temperature("P-07")]: [{ at: ago(15), value: 47.5, unit: "degreeCelsius" }],
  })

  const series = await listMeasurementSeries(apis, 15, 180, now, "P-04")
  const lines = series.quantities.flatMap((one) => one.lines.map((line) => line.machine))
  assert.deepEqual([...new Set(lines)], ["P-04"])
  const topics = requested.filter((url) => url.pathname.startsWith("/timeseries/")).map((url) => decodeURIComponent(url.pathname))
  assert.ok(topics.length > 0)
  assert.equal(topics.every((path) => path.includes("/topics/machines/P-04/")), true)
})

test("the measurements of one machine read the signs of life of that machine only", async () => {
  const requested = serve({
    ...heartbeat("P-04", 960, 0),
    ...heartbeat("P-07", 960, 0),
    "machines/P-04/oem/Spindle/1/BearingTemperature": [{ at: ago(30), value: 46, unit: "degreeCelsius" }],
  })

  const list = await listMeasurements(apis, now, "P-04")
  assert.deepEqual(list.machines.map((one) => one.machine), ["P-04"])
  const values = requested.filter((url) => url.pathname.startsWith("/timeseries/")).map((url) => decodeURIComponent(url.pathname))
  assert.equal(values.some((path) => path.includes("/machines/*/")), false)
  assert.equal(values.some((path) => path.includes("/machines/P-07/")), false)
})
