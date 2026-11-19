import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"

import { listEnergySeries, showEnergy } from "./energy.ts"

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
 * A meter that counts `perMinute` every minute, in `unit`, over the last `minutes`, starting at `first`.
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
  assert.deepEqual(p04.energy.start, { value: 5_000_000 + 59 * 60_000, unit: "joule", at: ago(60.5) })
  assert.deepEqual(p04.energy.end, { value: 5_000_000 + 119 * 60_000, unit: "joule", at: ago(0.5) })
  assert.equal(p04.energy.value, 3_600_000)
  assert.equal(p04.energy.topic, meterOf("P-04"))
  // 3,600,000 J between two values of the meter an hour apart: 1,000 W, whatever the values of the power were.
  assert.deepEqual(p04.power, { meanWatt: 1000, peakWatt: 3000, values: 60, unit: "watt", error: null, topic: powerOf("P-04") })
  assert.equal(p04.energy.unit, "joule")
  assert.equal(shown.machines[0]!.energy.value, 7_200_000)
})

test("a meter without a value before the hours is counted from its first one in them", async () => {
  // The machine came twenty minutes ago.
  serve({ [meterOf("P-07")]: meter(0, 60_000, 20), [powerOf("P-07")]: power(20, [3600]) })
  const shown = await showEnergy(apis, 1, undefined, now)
  const p07 = shown.machines[0]!
  assert.deepEqual(p07.energy.start, { value: 0, unit: "joule", at: ago(19.5) })
  assert.equal(p07.energy.value, 19 * 60_000)
})

test("a meter value from before a gap is not counted: the energy begins with the first value in the hours", async () => {
  serve({
    // The adapter was away for three days while the machine ran, and came back twenty minutes ago.
    [meterOf("P-04")]: {
      unit: "joule",
      values: [{ at: ago(3 * 24 * 60), value: 1_000_000 }, ...meter(90_000_000, 60_000, 20).values],
    },
  })
  const p04 = (await showEnergy(apis, 1, undefined, now)).machines[0]!
  assert.deepEqual(p04.energy.start, { value: 90_000_000, unit: "joule", at: ago(19.5) })
  assert.equal(p04.energy.value, 19 * 60_000)
})

test("a meter in watt hours, as the data model has it, counts in watt hours, and nothing is converted", async () => {
  const id = "alcyone-machines_AX-400_P-04"
  serve({
    [meterOf(id)]: meter(120_000, 1_000, 120, "wattHour"),
    [powerOf(id)]: power(60, [3000]),
  })
  const shown = (await showEnergy(apis, 1, undefined, now)).machines[0]!
  assert.equal(shown.machine, id)
  assert.deepEqual(shown.energy.start, { value: 120_000 + 59 * 1_000, unit: "wattHour", at: ago(60.5) })
  assert.equal(shown.energy.value, 60 * 1_000)
  assert.equal(shown.energy.unit, "wattHour")
})

test("machines in two units: those in watt hours first, each unit by its energy, unconverted", async () => {
  serve({
    // Values from before the data model 0.17.1, in joule: 1 kWh is 3,600,000 J.
    [meterOf("P-04")]: meter(0, 60_000, 120),
    [meterOf("alcyone-machines_AX-400_P-04")]: meter(0, 10, 120, "wattHour"),
    [meterOf("merope-microtec_MM-120_M-02")]: meter(0, 20, 120, "wattHour"),
  })
  const shown = await showEnergy(apis, 1, undefined, now)
  assert.deepEqual(shown.machines.map((one) => [one.machine, one.energy.value, one.energy.unit]), [
    ["merope-microtec_MM-120_M-02", 1_200, "wattHour"],
    ["alcyone-machines_AX-400_P-04", 600, "wattHour"],
    ["P-04", 3_600_000, "joule"],
  ])
})

test("a meter that changed its unit in the hours: its energy is not known", async () => {
  serve({
    [meterOf("P-04")]: {
      unit: "joule",
      values: [{ at: ago(60.25), value: 8_000_000 }, { at: ago(30), value: 8_100_000 }],
    },
  })
  // The fake keeps one unit for a topic: the newest value comes from a second store with watt hours.
  const fake = globalThis.fetch
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input))
    if (url.searchParams.get("sorting") === "Descending" && url.searchParams.get("stopTime") === now.toISOString()) {
      return Response.json({ series: [{ topic: meterOf("P-04"), unit: "wattHour", timestamps: [Date.parse(ago(1)) * 1000], values: [2_300] }] })
    }
    return fake(input, init)
  }) as typeof fetch
  const p04 = (await showEnergy(apis, 1, undefined, now)).machines[0]!
  assert.equal(p04.energy.value, null)
  assert.equal(p04.energy.meterWentBack, false)
  assert.deepEqual([p04.energy.start?.unit, p04.energy.end?.unit], ["joule", "wattHour"])
})

test("a meter that went back was reset: its energy is not known, and the machine comes last", async () => {
  serve({
    // The meter published a quarter of a minute before the hours began, then less.
    [meterOf("P-04")]: { unit: "joule", values: [{ at: ago(60.25), value: 8_000_000 }, { at: ago(30), value: 1_000 }] },
    [meterOf("M-02")]: meter(0, 1_000, 60),
    // A meter or a power in a unit that is not one of energy or power is not read.
    [meterOf("K-01")]: meter(0, 1, 60, "kilowattHour"),
    [powerOf("K-01")]: { ...power(60, [2]), unit: "kilowatt" },
  })
  const shown = await showEnergy(apis, 1, undefined, now)
  assert.deepEqual(shown.machines.map((one) => [one.machine, one.energy.value, one.energy.meterWentBack]), [
    ["M-02", 59_000, false],
    ["K-01", null, false],
    ["P-04", null, true],
  ])
  // The unit that was found says why there is no energy and no power.
  assert.equal(shown.machines[1]!.energy.unit, "kilowattHour")
  assert.deepEqual(shown.machines[1]!.power, { meanWatt: null, peakWatt: null, values: 0, unit: "kilowatt", error: null, topic: powerOf("K-01") })
  // No power was published: neither mean nor peak.
  assert.deepEqual(shown.machines[2]!.power, { meanWatt: null, peakWatt: null, values: 0, unit: null, error: null, topic: powerOf("P-04") })
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
    message: 'No machine "Z-99" published active power, its energy meter or a heartbeat in the last hour. Machines that did: P-04.',
  })
})

test("the machines to compare are named by their ids or as people call them", async () => {
  const [p04, p07] = ["alcyone-machines_AX-400_P-04", "taygeta-precision_TP-800_P-07"]
  serve({ [meterOf(p04)]: meter(0, 1_000, 60), [meterOf(p07)]: meter(0, 2_000, 60) })
  const shown = await showEnergy(apis, 1, ["P-04", "TP-800 P-07"], now)
  assert.deepEqual(shown.machines.map((one) => one.machine), [p07, p04])
})

/** A heartbeat every ten seconds in each stretch, from so many minutes ago to so many. */
const heartbeat = (machine: string, ...stretches: Array<[from: number, to: number]>) => ({
  [`machines/${machine}/umati/Connection/Heartbeat`]: {
    unit: "one",
    values: stretches.flatMap(([fromMinutes, toMinutes]) =>
      Array.from({ length: Math.floor(((fromMinutes - toMinutes) * 60) / 10) + 1 }, (_, index) => ({
        at: ago(fromMinutes - index / 6),
        value: index,
      })),
    ),
  },
})

test("a line holds the value that held at each instant, also where the API kept none, and breaks where the machine was silent", async () => {
  const requested = serve({
    // P-04 publishes on change: twice at the start, once while idle, once at the end. Its heartbeat
    // stops for ten minutes in the middle.
    [powerOf("P-04")]: {
      unit: "watt",
      values: [
        { at: ago(58), value: 1000 },
        { at: ago(57), value: 1200 },
        { at: ago(35), value: 300 },
        { at: ago(8), value: 2000 },
      ],
    },
    ...heartbeat("P-04", [61, 25], [15, 0]),
    [powerOf("M-02")]: { unit: "watt", values: [{ at: ago(55), value: 2000 }, { at: ago(5), value: 4000 }] },
    ...heartbeat("M-02", [61, 0]),
  })
  const series = await listEnergySeries(apis, ago(60), now.toISOString(), ["P-04", "M-02"], 6)
  assert.deepEqual(series.instants, [ago(50), ago(40), ago(30), ago(20), ago(10), ago(0)])
  assert.deepEqual(series.lines.map((line) => line.machine), ["P-04", "M-02"])
  assert.deepEqual(series.lines[0]!.watt, [1200, 1200, 300, null, null, 2000])
  assert.deepEqual(series.lines[1]!.watt, [2000, 2000, 2000, 2000, 2000, 4000])
  // The power of each machine thinned by the API to twice the slots.
  const thinned = requested.filter(({ url }) => url.searchParams.get("downsample") === "true")
  assert.deepEqual(thinned.map(({ url }) => url.searchParams.get("limit")), ["12", "12"])
})

test("a line begins with the value that held where the hours begin, as the graphs of the measurements do", async () => {
  serve({
    // 1.2 kW from before the hours until 300 W a little after their middle.
    [powerOf("P-04")]: { unit: "watt", values: [{ at: ago(65), value: 1200 }, { at: ago(25), value: 300 }] },
    ...heartbeat("P-04", [66, 0]),
  })
  const series = await listEnergySeries(apis, ago(60), now.toISOString(), ["P-04"], 6)
  assert.deepEqual(series.lines[0]!.watt, [1200, 1200, 1200, 300, 300, 300])
})

test("the lines read the topics of the machines asked for only, not those of every machine", async () => {
  const requested = serve({
    [powerOf("P-04")]: power(60, [1000]),
    ...heartbeat("P-04", [61, 0]),
    [powerOf("M-02")]: power(60, [2000]),
    ...heartbeat("M-02", [61, 0]),
  })
  const series = await listEnergySeries(apis, ago(60), now.toISOString(), ["P-04"], 6)
  assert.deepEqual(series.lines.map((line) => line.machine), ["P-04"])
  const topics = requested
    .filter(({ url }) => url.pathname.startsWith("/timeseries/"))
    .map(({ url }) => decodeURIComponent(url.pathname.replace(/^\/timeseries\/\w+\/topics\//, "")))
  assert.ok(topics.length > 0)
  for (const topic of topics) assert.match(topic, /^machines\/P-04\//)
})

test("a machine switched off, with a meter that publishes on change: 0 kWh, counted from its value before the hours", async () => {
  serve({
    // The meter last changed five hours ago; the heartbeat says the machine was there all the time.
    [meterOf("P-04")]: { unit: "wattHour", values: [{ at: ago(300), value: 5_000 }] },
    ...heartbeat("P-04", [301, 0]),
  })
  for (const named of [undefined, ["P-04"]]) {
    const shown = await showEnergy(apis, 1, named, now)
    assert.deepEqual(shown.machines.map((one) => one.machine), ["P-04"])
    const p04 = shown.machines[0]!
    assert.equal(p04.energy.value, 0)
    assert.deepEqual(p04.energy.start, { value: 5_000, unit: "wattHour", at: ago(300) })
    assert.equal(p04.power.meanWatt, 0)
  }
})

test("a meter value before a silence of the machine is not counted, however young", async () => {
  serve({
    // Two minutes before the hours, then the machine fell silent until ten minutes into them.
    [meterOf("P-04")]: { unit: "wattHour", values: [{ at: ago(62), value: 1_000 }, { at: ago(50), value: 9_000 }, { at: ago(0), value: 9_500 }] },
    ...heartbeat("P-04", [63, 62], [50, 0]),
  })
  const p04 = (await showEnergy(apis, 1, undefined, now)).machines[0]!
  assert.deepEqual(p04.energy.start, { value: 9_000, unit: "wattHour", at: ago(50) })
  assert.equal(p04.energy.value, 500)
})

test("the mean power is weighted by time: the energy over the time it covers", async () => {
  serve({
    // 3,000 W for a minute, then 500 W held for 59 minutes: about 541.7 Wh, not a mean of 1,750 W.
    [meterOf("P-04")]: { unit: "wattHour", values: [{ at: ago(60), value: 0 }, { at: ago(0), value: 50 + (500 * 59) / 60 }] },
    [powerOf("P-04")]: { unit: "watt", values: [{ at: ago(60), value: 3_000 }, { at: ago(59), value: 500 }] },
    ...heartbeat("P-04", [61, 0]),
  })
  const p04 = (await showEnergy(apis, 1, undefined, now)).machines[0]!
  assert.ok(Math.abs(p04.power.meanWatt! - (50 + (500 * 59) / 60)) < 1e-9, String(p04.power.meanWatt))
  assert.equal(p04.power.peakWatt, 3_000)
})

test("statistics that fail leave the energy and the mean; the peak is not known, and the result says why", async () => {
  serve({ [meterOf("P-04")]: meter(0, 1_000, 60, "wattHour"), [powerOf("P-04")]: power(60, [1000]) })
  const fake = globalThis.fetch
  globalThis.fetch = (async (input, init) => {
    if (new URL(String(input)).pathname.startsWith("/statistics/")) return new Response("Unit is missing", { status: 404 })
    return fake(input, init)
  }) as typeof fetch
  const p04 = (await showEnergy(apis, 1, undefined, now)).machines[0]!
  assert.equal(p04.energy.value, 59_000)
  // 59,000 Wh between the first and the last value of the meter, 59 minutes apart: 60,000 W.
  assert.ok(Math.abs(p04.power.meanWatt! - 60_000) < 1e-6, String(p04.power.meanWatt))
  assert.equal(p04.power.peakWatt, null)
  assert.match(p04.power.error ?? "", /Timeseries API answered 404/)
})

test("the lines cover a day at most", async () => {
  serve({})
  await assert.rejects(listEnergySeries(apis, "2026-11-15T16:00:00.000Z", now.toISOString()), /at most 24 hours/)
  await assert.rejects(listEnergySeries(apis, now.toISOString(), ago(60)), /must lie after/)
})
