import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"

import { listMeasurementSeries, listMeasurements, measurementOf, slotted } from "./measurements.ts"

const apis = { timeseriesUrl: "http://timeseries:8080", eventsUrl: "http://events:8080" }
const now = new Date("2026-11-16T09:30:00.000Z")
// The Timeseries API counts microseconds since 1970.
const micros = (instant: string) => Date.parse(instant) * 1000

afterEach(() => mock.restoreAll())

test("a value is current for 30 seconds, and none is never current", () => {
  const at = (instant: string) => measurementOf("t", "activePower", { at: instant, value: 1, unit: "watt" }, now)
  assert.equal(at("2026-11-16T09:29:30.000Z").stale, false)
  assert.equal(at("2026-11-16T09:29:29.999Z").stale, true)
  assert.deepEqual(measurementOf("t", "activePower", null, now), {
    quantity: "activePower",
    value: null,
    unit: null,
    at: null,
    stale: true,
    topic: "t",
  })
})

test("every machine gets each quantity from the newest value of its topic, in the unit it was stored in", async () => {
  const requested: Array<URL> = []
  mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input))
    requested.push(url)
    if (url.pathname === "/topics") {
      return Response.json({ baseUnitTopics: ["machines/P-04/umati/Connection/Heartbeat"], stringTopics: [], booleanTopics: [] })
    }
    const topic = decodeURIComponent(url.pathname.replace(/^\/timeseries\/\w+\/topics\//, ""))
    if (topic.endsWith("AcActivePowerTotal")) {
      return Response.json({
        series: [{ topic, unit: "watt", timestamps: [micros("2026-11-16T09:29:58.000Z")], values: [2410.5] }],
      })
    }
    if (topic.endsWith("IsRotating")) {
      return Response.json({ series: [{ topic, timestamps: [micros("2026-11-16T09:29:00.000Z")], values: [true] }] })
    }
    return Response.json({ series: [] })
  })

  const list = await listMeasurements(apis, now)
  assert.deepEqual(
    list.machines.map((one) => one.machine),
    ["P-04"],
  )
  const [machine] = list.machines
  assert.deepEqual(
    machine?.measurements.map((one) => one.quantity),
    ["activePower", "energyImported", "bearingTemperature", "spindleRotating", "feedOverride", "spindleOverride", "powerOnDuration"],
  )
  assert.deepEqual(machine?.measurements[0], {
    quantity: "activePower",
    value: 2410.5,
    unit: "watt",
    at: "2026-11-16T09:29:58.000Z",
    stale: false,
    topic: "machines/P-04/umati/Consumption/Electricity/Main/AcActivePowerTotal",
  })
  assert.equal(machine?.measurements[3]?.value, true)
  assert.equal(machine?.measurements[3]?.unit, null)
  assert.equal(machine?.measurements[3]?.stale, true)
  assert.equal(machine?.measurements[1]?.value, null)

  // The newest value only, however old: one, in descending order, from the beginning.
  const read = requested.find((url) => url.pathname.endsWith("AcActivePowerTotal"))
  assert.equal(read?.pathname.startsWith("/timeseries/baseUnitValues/"), true)
  assert.equal(read?.searchParams.get("limit"), "1")
  assert.equal(read?.searchParams.get("sorting"), "Descending")
  assert.equal(read?.searchParams.get("startTime"), "1970-01-01T00:00:00.000Z")
  assert.equal(
    requested.some((url) => url.pathname === "/timeseries/booleanValues/topics/machines/P-04/umati/Spindle/1/IsRotating"),
    true,
  )
})

test("a line shows at the end of each slot the value that held, as it was measured, and none after a silence", () => {
  const from = new Date("2026-11-16T09:00:00.000Z")
  const to = new Date("2026-11-16T09:02:00.000Z")
  const at = (second: number) => new Date(from.getTime() + second * 1000).toISOString()
  const points = [
    { at: at(3), value: true },
    { at: at(8), value: false },
    { at: at(12), value: true },
  ]
  // Twelve slots of ten seconds: the value of 08 holds at 10, the one of 12 until 42; then nothing is known.
  assert.deepEqual(
    slotted(points, from, to, 12).map((one) => [one.at.slice(14, 19), one.value]),
    [
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
    ],
  )
  assert.equal(slotted([], from, to, 4).every((one) => one.value === null), true)
})

test("the series give a line for each machine and quantity, with the unit they were stored in", async () => {
  const requested: Array<URL> = []
  mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input))
    requested.push(url)
    if (url.pathname.endsWith("BearingTemperature")) {
      const topic = (machine: string) => `machines/${machine}/vendor/Spindle/1/BearingTemperature`
      return Response.json({
        series: [
          { topic: topic("P-07"), unit: "degreeCelsius", timestamps: [micros("2026-11-16T09:29:45.000Z")], values: [47.5] },
          { topic: topic("P-04"), unit: "degreeCelsius", timestamps: [micros("2026-11-16T09:29:30.000Z"), micros("2026-11-16T09:28:00.000Z")], values: [46, 45] },
        ],
      })
    }
    return Response.json({ series: [] })
  })

  const series = await listMeasurementSeries(apis, 15, 180, now)
  assert.equal(series.from, "2026-11-16T09:15:00.000Z")
  assert.equal(series.to, now.toISOString())
  const temperature = series.quantities.find((one) => one.quantity === "bearingTemperature")
  assert.equal(temperature?.unit, "degreeCelsius")
  assert.deepEqual(
    temperature?.lines.map((line) => line.machine),
    ["P-04", "P-07"],
  )
  // Every line has a point for each slot of five seconds, on the same instants.
  const [p04, p07] = temperature?.lines ?? []
  assert.equal(p04?.points.length, 180)
  assert.deepEqual(p04?.points.map((one) => one.at), p07?.points.map((one) => one.at))
  assert.equal(p04?.points.at(-1)?.at, now.toISOString())
  assert.equal(p04?.points.at(-1)?.value, 46)
  assert.equal(p04?.points.find((one) => one.at === "2026-11-16T09:28:00.000Z")?.value, 45)
  assert.equal(p07?.points.at(-1)?.value, 47.5)
  assert.deepEqual(series.quantities.find((one) => one.quantity === "activePower")?.lines, [])
  // One request for each quantity, over all machines at once.
  assert.equal(requested.length, 7)
  assert.equal(requested.every((url) => url.pathname.includes("/topics/machines/*/")), true)
})
