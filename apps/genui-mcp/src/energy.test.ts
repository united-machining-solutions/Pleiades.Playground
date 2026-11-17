import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"

import { listEnergySeries, showEnergy, slotMeans } from "./energy.ts"

const apis = { timeseriesUrl: "http://timeseries:8080", eventsUrl: "http://events:8080" }
const now = new Date("2026-11-17T16:00:00.000Z")
// The Timeseries API counts microseconds since 1970.
const micros = (instant: string) => Date.parse(instant) * 1000
/** The instant so many minutes before `now`. */
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString()

afterEach(() => mock.restoreAll())

type Stored = { at: string; value: number }
type Store = Record<string, { unit: string; values: Array<Stored> }>

const meterOf = (machine: string) => `machines/${machine}/umati/Consumption/Electricity/Main/AcActiveEnergyTotalImportHp`
const powerOf = (machine: string) => `machines/${machine}/umati/Consumption/Electricity/Main/AcActivePowerTotal`

/**
 * A Timeseries API that holds `store`. As the real one, its `*` reaches over several levels; it
 * answers the newest or oldest values, values thinned to a limit, and statistics over a window.
 */
function serve(store: Store): Array<{ url: URL; body?: unknown }> {
  const requested: Array<{ url: URL; body?: unknown }> = []
  const matching = (pattern: string) => {
    const escaped = pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    const matches = new RegExp(`^${escaped.join(".+")}$`)
    return Object.entries(store).filter(([topic]) => matches.test(topic))
  }
  const within = (values: Array<Stored>, start: string, stop: string) =>
    values.filter((one) => one.at >= start && one.at <= stop).sort((a, b) => a.at.localeCompare(b.at))
  mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input))
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    requested.push({ url, body })
    if (url.pathname === "/topics") {
      const start = url.searchParams.get("startTime") ?? ""
      const stop = url.searchParams.get("stopTime") ?? ""
      const topics = Object.entries(store).filter(([, one]) => within(one.values, start, stop).length > 0)
      return Response.json({ baseUnitTopics: topics.map(([topic]) => topic), stringTopics: [], booleanTopics: [] })
    }
    if (url.pathname.startsWith("/statistics/")) {
      const pattern = decodeURIComponent(url.pathname.replace(/^\/statistics\/baseUnitValues\/topics\//, ""))
      const [{ start, stop }] = body as Array<{ start: string; stop: string }>
      const answer = Object.fromEntries(
        matching(pattern).flatMap(([topic, one]) => {
          const values = within(one.values, start, stop).map((sample) => sample.value)
          if (values.length === 0) return []
          const mean = values.reduce((sum, value) => sum + value, 0) / values.length
          return [[topic, { unit: one.unit, max: Math.max(...values), min: Math.min(...values), mean, median: "NaN", std: "NaN", delta: 0, count: values.length }]]
        }),
      )
      return Response.json(answer)
    }
    const pattern = decodeURIComponent(url.pathname.replace(/^\/timeseries\/\w+\/topics\//, ""))
    const start = url.searchParams.get("startTime") ?? ""
    const stop = url.searchParams.get("stopTime") ?? ""
    const limit = Number(url.searchParams.get("limit") ?? Number.POSITIVE_INFINITY)
    const series = matching(pattern)
      .map(([topic, one]) => {
        let picked = within(one.values, start, stop)
        if (url.searchParams.get("sorting") === "Descending") picked = picked.reverse().slice(0, limit)
        if (url.searchParams.get("sorting") === "Ascending") picked = picked.slice(0, limit)
        if (url.searchParams.get("downsample") === "true" && picked.length > limit) {
          const step = picked.length / limit
          picked = Array.from({ length: limit }, (_, index) => picked[Math.floor(index * step)]!)
        }
        return { topic, unit: one.unit, timestamps: picked.map((sample) => micros(sample.at)), values: picked.map((sample) => sample.value) }
      })
      .filter((one) => one.timestamps.length > 0)
    return Response.json({ series })
  })
  return requested
}

/**
 * A meter that counts `perMinute` joule every minute over the last `minutes`, starting at `first`.
 * It publishes half a minute off the full minutes, so no value lies on the border of the hours.
 */
const meter = (first: number, perMinute: number, minutes: number, unit = "joule") => ({
  unit,
  values: Array.from({ length: minutes }, (_, index) => ({ at: ago(minutes - index - 0.5), value: first + index * perMinute })),
})
/** Active power, one value a minute over the last `minutes`, from `values` in turn. */
const power = (minutes: number, values: Array<number>) => ({
  unit: "watt",
  values: Array.from({ length: minutes }, (_, index) => ({ at: ago(minutes - 1 - index), value: values[index % values.length]! })),
})

test("the energy of a machine is the meter at the end less the meter where the hours began", async () => {
  serve({
    // The meter counted for two hours: 60,000 J a minute, so one hour is 3,600,000 J, 1 kWh.
    [meterOf("P-04")]: meter(5_000_000, 60_000, 120),
    [powerOf("P-04")]: power(60, [1000, 3000]),
    [meterOf("M-02")]: meter(9_000_000, 120_000, 120),
    [powerOf("M-02")]: power(60, [2000]),
  })
  const shown = await showEnergy(apis, 1, undefined, now)
  assert.equal(shown.from, ago(60))
  assert.equal(shown.to, now.toISOString())
  // The one that imported the most first.
  assert.deepEqual(shown.machines.map((one) => one.machine), ["M-02", "P-04"])
  const p04 = shown.machines[1]!
  // The newest value before the hours began, not the first in them.
  assert.deepEqual(p04.energy.start, { joule: 5_000_000 + 59 * 60_000, at: ago(60.5) })
  assert.deepEqual(p04.energy.end, { joule: 5_000_000 + 119 * 60_000, at: ago(0.5) })
  assert.equal(p04.energy.joule, 3_600_000)
  assert.equal(p04.energy.topic, meterOf("P-04"))
  assert.deepEqual(p04.power, { meanWatt: 2000, peakWatt: 3000, values: 60, topic: powerOf("P-04") })
  assert.equal(shown.machines[0]!.energy.joule, 7_200_000)
})

test("a meter without a value before the hours is counted from its first one in them", async () => {
  // The machine came twenty minutes ago.
  serve({ [meterOf("P-07")]: meter(0, 60_000, 20), [powerOf("P-07")]: power(20, [3600]) })
  const shown = await showEnergy(apis, 1, undefined, now)
  const p07 = shown.machines[0]!
  assert.deepEqual(p07.energy.start, { joule: 0, at: ago(19.5) })
  assert.equal(p07.energy.joule, 19 * 60_000)
})

test("a meter that went back was reset: its energy is not known, and the machine comes last", async () => {
  serve({
    [meterOf("P-04")]: { unit: "joule", values: [{ at: ago(90), value: 8_000_000 }, { at: ago(30), value: 1_000 }] },
    [meterOf("M-02")]: meter(0, 1_000, 60),
    // A meter or a power in another unit than the binding's is not read as joule or watt.
    [meterOf("K-01")]: meter(0, 1, 60, "wattHour"),
    [powerOf("K-01")]: { ...power(60, [2]), unit: "kilowatt" },
  })
  const shown = await showEnergy(apis, 1, undefined, now)
  assert.deepEqual(shown.machines.map((one) => [one.machine, one.energy.joule, one.energy.meterWentBack]), [
    ["M-02", 59_000, false],
    ["K-01", null, false],
    ["P-04", null, true],
  ])
  assert.deepEqual(shown.machines[1]!.power, { meanWatt: null, peakWatt: null, values: 0, topic: powerOf("K-01") })
  // No power was published: neither mean nor peak.
  assert.deepEqual(shown.machines[2]!.power, { meanWatt: null, peakWatt: null, values: 0, topic: powerOf("P-04") })
})

test("a topic below the path of a machine is neither a machine nor its power", async () => {
  const requested = serve({
    [meterOf("P-04")]: meter(0, 1_000, 60),
    [powerOf("P-04")]: power(60, [1000]),
    // The `*` of the API reaches these too.
    [`machines/P-04/extra/umati/Consumption/Electricity/Main/AcActivePowerTotal`]: power(60, [90_000]),
    [`machines/Q-09/line/umati/Consumption/Electricity/Main/AcActivePowerTotal`]: power(60, [90_000]),
  })
  const shown = await showEnergy(apis, 1, undefined, now)
  assert.deepEqual(shown.machines.map((one) => one.machine), ["P-04"])
  assert.equal(shown.machines[0]!.power.peakWatt, 1000)
  // The statistics are read once for every machine, with the topic as one level of the path.
  const statistics = requested.filter(({ url }) => url.pathname.startsWith("/statistics/"))
  assert.equal(statistics.length, 1)
  assert.match(statistics[0]!.url.pathname, /machines%2F\*%2Fumati%2F/)

  const series = await listEnergySeries(apis, ago(60), now.toISOString(), undefined, 6)
  assert.deepEqual(series.lines.map((line) => line.topic), [powerOf("P-04")])
})

test("a machine that published nothing is refused in words, with the machines that did", async () => {
  serve({ [meterOf("P-04")]: meter(0, 1_000, 60) })
  await assert.rejects(showEnergy(apis, 1, ["P-04", "Z-99"], now), {
    message: 'No machine "Z-99" published active power or its energy meter in the last hour. Machines that did: P-04.',
  })
})

test("the lines share their instants, each slot the mean of its values, none where there is none", async () => {
  const requested = serve({
    // Six slots of ten minutes: P-04 two values a slot, M-02 silent in the middle.
    [powerOf("P-04")]: { unit: "watt", values: Array.from({ length: 12 }, (_, index) => ({ at: ago(57.5 - index * 5), value: index * 100 })) },
    [powerOf("M-02")]: { unit: "watt", values: [{ at: ago(55), value: 2000 }, { at: ago(5), value: 4000 }] },
  })
  const series = await listEnergySeries(apis, ago(60), now.toISOString(), ["P-04", "M-02"], 6)
  assert.deepEqual(series.instants, [ago(50), ago(40), ago(30), ago(20), ago(10), ago(0)])
  assert.deepEqual(series.lines.map((line) => line.machine), ["P-04", "M-02"])
  assert.deepEqual(series.lines[0]!.watt, [50, 250, 450, 650, 850, 1050])
  assert.deepEqual(series.lines[1]!.watt, [2000, null, null, null, null, 4000])
  // Thinned by the API to twice the slots, one request for every machine.
  const read = requested.filter(({ url }) => url.pathname.startsWith("/timeseries/"))
  assert.equal(read.length, 1)
  assert.equal(read[0]!.url.searchParams.get("downsample"), "true")
  assert.equal(read[0]!.url.searchParams.get("limit"), "12")
})

test("the lines cover a day at most", async () => {
  serve({})
  await assert.rejects(listEnergySeries(apis, "2026-11-15T16:00:00.000Z", now.toISOString()), /at most 24 hours/)
  await assert.rejects(listEnergySeries(apis, now.toISOString(), ago(60)), /must lie after/)
})

test("a value on the border of two slots belongs to the slot it ends", () => {
  const instants = ["2026-11-17T15:10:00.000Z", "2026-11-17T15:20:00.000Z"]
  const samples = [
    { at: "2026-11-17T14:59:59.000Z", value: 999 },
    { at: "2026-11-17T15:00:00.000Z", value: 10 },
    { at: "2026-11-17T15:10:00.000Z", value: 30 },
    { at: "2026-11-17T15:10:01.000Z", value: 7 },
    { at: "2026-11-17T15:20:01.000Z", value: 999 },
  ]
  assert.deepEqual(slotMeans(samples, "2026-11-17T15:00:00.000Z", instants), [20, 7])
})
