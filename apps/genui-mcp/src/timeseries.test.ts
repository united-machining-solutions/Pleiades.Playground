import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"

import {
  forgetPublished,
  listTimeseriesSeries,
  listTimeseriesSignals,
  onInstants,
  resolveLines,
  resolveSignal,
  showTimeseries,
  signalsOf,
} from "./timeseries.ts"

const apis = { timeseriesUrl: "http://timeseries:8080", eventsUrl: "http://events:8080" }
const now = new Date("2026-11-18T10:00:00.000Z")
// The Timeseries API counts microseconds since 1970.
const micros = (instant: string) => Date.parse(instant) * 1000
/** The instant so many minutes before `now`. */
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString()

afterEach(() => {
  mock.restoreAll()
  // What the machines published is kept for a minute; every test has a store of its own.
  forgetPublished()
})

const P04 = "alcyone-machines_AX-400_P-04"
const P07 = "taygeta-precision_TP-800_P-07"
const POWER = "umati/Consumption/Electricity/Main/AcActivePowerTotal"
const BEARING = "oem/Spindle/1/BearingTemperature"
const ROTATING = "umati/Spindle/1/IsRotating"
const OVERRIDE = "umati/Spindle/1/Override"
const HEARTBEAT = "umati/Connection/Heartbeat"
const PROGRAM = "oem/WorkMasterMonitoring/ActiveProgram"

type Stored = { at: string; value: number | boolean | string }
type Store = Record<string, { kind: "number" | "yesNo" | "text"; unit?: string; values: Array<Stored> }>

/**
 * A Timeseries API that holds `store`. As the real one, its `*` reaches over several levels; it
 * lists topics by kind, answers the newest values, values thinned to a limit, and statistics.
 */
function serve(store: Store): Array<URL> {
  const requested: Array<URL> = []
  const within = (values: Array<Stored>, start: string, stop: string) =>
    values.filter((one) => one.at >= start && one.at <= stop).sort((a, b) => a.at.localeCompare(b.at))
  mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input))
    requested.push(url)
    if (url.pathname === "/topics") {
      const start = url.searchParams.get("startTime") ?? ""
      const stop = url.searchParams.get("stopTime") ?? ""
      const of = (kind: string) => Object.entries(store).filter(([, one]) => one.kind === kind && within(one.values, start, stop).length > 0).map(([topic]) => topic)
      return Response.json({ baseUnitTopics: of("number"), stringTopics: of("text"), booleanTopics: of("yesNo") })
    }
    if (url.pathname.startsWith("/statistics/")) {
      const topic = decodeURIComponent(url.pathname.replace(/^\/statistics\/baseUnitValues\/topics\//, ""))
      const [{ start, stop }] = JSON.parse(String(init?.body)) as Array<{ start: string; stop: string }>
      const one = store[topic]
      const values = one ? within(one.values, start, stop).map((sample) => Number(sample.value)) : []
      if (!one || values.length === 0) return Response.json({})
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length
      return Response.json({ [topic]: { unit: one.unit, max: Math.max(...values), min: Math.min(...values), mean, median: "NaN", count: values.length } })
    }
    const [, store_, rest] = /^\/timeseries\/(\w+)\/topics\/(.+)$/.exec(url.pathname) ?? []
    const topic = decodeURIComponent(rest ?? "")
    const kind = store_ === "baseUnitValues" ? "number" : store_ === "booleanValues" ? "yesNo" : "text"
    const one = store[topic]
    if (!one || one.kind !== kind) return Response.json({ series: [] })
    const limit = Number(url.searchParams.get("limit") ?? Number.POSITIVE_INFINITY)
    let picked = within(one.values, url.searchParams.get("startTime") ?? "", url.searchParams.get("stopTime") ?? "")
    if (url.searchParams.get("sorting") === "Descending") picked = picked.reverse().slice(0, limit)
    if (url.searchParams.get("downsample") === "true" && picked.length > limit) {
      // Keeps the largest of each bucket, as LTTB keeps a peak.
      const size = picked.length / limit
      picked = Array.from({ length: limit }, (_, index) => {
        const bucket = picked.slice(Math.floor(index * size), Math.floor((index + 1) * size))
        return bucket.reduce((best, sample) => (Number(sample.value) > Number(best.value) ? sample : best))
      })
    }
    if (picked.length === 0) return Response.json({ series: [] })
    return Response.json({ series: [{ topic, unit: one.unit, timestamps: picked.map((sample) => micros(sample.at)), values: picked.map((sample) => sample.value) }] })
  })
  return requested
}

/** Values every `every` minutes over the last `minutes`, half a minute off the full minutes. */
function every(minutes: number, every: number, value: (minute: number) => number | boolean): Array<Stored> {
  return Array.from({ length: Math.floor(minutes / every) }, (_, index) => {
    const minute = minutes - index * every - 0.5
    return { at: ago(minute), value: value(minute) }
  })
}

/** A machine that lives: a heartbeat every ten seconds over the last `minutes`. */
const alive = (minutes: number): Array<Stored> =>
  Array.from({ length: minutes * 6 + 6 }, (_, index) => ({ at: ago(minutes + 1 - index / 6), value: index }))

function demo(): Store {
  return {
    [`machines/${P04}/${POWER}`]: { kind: "number", unit: "watt", values: every(60 * 25, 1, (minute) => 4000 + (minute === 30.5 ? 11000 : 0)) },
    [`machines/${P07}/${POWER}`]: { kind: "number", unit: "watt", values: every(60 * 25, 1, () => 6000) },
    [`machines/${P04}/${BEARING}`]: { kind: "number", unit: "degreeCelsius", values: every(60 * 25, 1, (minute) => 30 + Math.floor(minute / 10)) },
    [`machines/${P04}/${OVERRIDE}`]: { kind: "number", unit: "one", values: [{ at: ago(300), value: 0.95 }] },
    [`machines/${P04}/${ROTATING}`]: { kind: "yesNo", values: [{ at: ago(300), value: true }, { at: ago(20), value: false }, { at: ago(10), value: true }] },
    [`machines/${P04}/${PROGRAM}`]: { kind: "text", values: [{ at: ago(30), value: "SHAFT_4711.MPF" }] },
    [`machines/${P04}/${HEARTBEAT}`]: { kind: "number", unit: "one", values: alive(60 * 25) },
    [`machines/${P07}/${HEARTBEAT}`]: { kind: "number", unit: "one", values: alive(60 * 25) },
  }
}

test("a signal is found by its path, without its namespace, as an element of the model, or as a quantity", () => {
  const published = new Map<string, "number" | "yesNo" | "text">([
    [POWER, "number"],
    [BEARING, "number"],
    [OVERRIDE, "number"],
    [ROTATING, "yesNo"],
  ])
  assert.equal(resolveSignal(OVERRIDE, published), OVERRIDE)
  assert.equal(resolveSignal("Spindle/1/BearingTemperature", published), BEARING)
  assert.equal(resolveSignal("Spindle.1.Override", published), OVERRIDE)
  assert.equal(resolveSignal("x-alcyone-machines-example.Spindle.1.BearingTemperature", published), BEARING)
  assert.equal(resolveSignal("activePower", published), POWER)
  assert.equal(resolveSignal(" spindleRotating ", published), ROTATING)
  assert.equal(resolveSignal("Spindle/1/Speed", published), undefined)
  assert.equal(resolveSignal("umati/Spindle/1/BearingTemperature", published), undefined)
})

test("a quantity the machine does not publish is not found", () => {
  assert.equal(resolveSignal("bearingTemperature", new Map([[POWER, "number"]])), undefined)
})

test("a quantity the machine does not publish is refused with the signals it has, not as a text", () => {
  const published = signalsOf({ numbers: [`machines/${P04}/${POWER}`], texts: [], yesNo: [] })
  assert.throws(
    () => resolveLines([{ machine: P04, signal: "bearingTemperature" }], published),
    new RegExp(`published no signal "bearingTemperature".*by path: ${POWER.replaceAll("/", "\\/")}\\.`),
  )
})

test("a path without namespace that both namespaces have is not guessed", () => {
  const published = new Map<string, "number">([["umati/Spindle/1/Load", "number"], ["oem/Spindle/1/Load", "number"]])
  assert.equal(resolveSignal("Spindle/1/Load", published), undefined)
})

test("the catalogue holds numbers and yes or no below umati and oem, not the heartbeat, and knows texts", () => {
  const signals = signalsOf({
    numbers: [`machines/${P04}/${POWER}`, `machines/${P04}/${HEARTBEAT}`, "sites/demo/weather/AirTemperature"],
    texts: [`machines/${P04}/${PROGRAM}`],
    yesNo: [`machines/${P04}/${ROTATING}`],
  })
  assert.deepEqual([...signals.keys()], [P04])
  assert.deepEqual(Object.fromEntries(signals.get(P04) ?? []), { [PROGRAM]: "text", [POWER]: "number", [ROTATING]: "yesNo" })
})

test("an unknown machine, an unknown signal and a text are refused with what there is instead", () => {
  const published = signalsOf({ numbers: [`machines/${P04}/${POWER}`], texts: [`machines/${P04}/${PROGRAM}`], yesNo: [] })
  assert.throws(() => resolveLines([{ machine: "nobody", signal: "activePower" }], published), /No machine "nobody".*Machines that did: alcyone/)
  assert.throws(
    () => resolveLines([{ machine: P04, signal: "Spindle/1/Speed" }], published),
    new RegExp(`published no signal "Spindle/1/Speed".*by path: ${POWER.replaceAll("/", "\\/")}\\.`),
  )
  assert.throws(() => resolveLines([{ machine: P04, signal: PROGRAM }], published), /is a text, and a time series draws numbers and yes or no/)
})

test("a machine is named by its id or as people call it", () => {
  const published = signalsOf({ numbers: [`machines/${P04}/${POWER}`], texts: [], yesNo: [] })
  const [line] = resolveLines([{ machine: "AX-400 P-04", signal: "activePower" }], published)
  assert.equal(line?.machine, P04)
  assert.equal(line?.topic, `machines/${P04}/${POWER}`)
})

test("a pair asked twice, also in other words, is one line", () => {
  const published = signalsOf({ numbers: [`machines/${P04}/${POWER}`], texts: [], yesNo: [] })
  const lines = resolveLines(
    [
      { machine: P04, signal: "activePower" },
      { machine: P04, signal: "activePower" },
      { machine: P04, signal: POWER },
    ],
    published,
  )
  assert.equal(lines.length, 1)
})

test("the time series says the newest, smallest and largest value of each line, in the unit it was published in", async () => {
  serve(demo())
  const shown = await showTimeseries(
    apis,
    [
      { machine: P04, signal: "activePower" },
      { machine: P07, signal: "activePower" },
      { machine: P04, signal: BEARING },
    ],
    "1h",
    now,
  )
  assert.equal(shown.from, ago(60))
  assert.deepEqual(
    shown.lines.map((one) => [one.machine, one.path, one.unit, one.low, one.high, one.now?.stale]),
    [
      [P04, POWER, "watt", 4000, 15000, false],
      [P07, POWER, "watt", 6000, 6000, false],
      [P04, BEARING, "degreeCelsius", 30, 35, false],
    ],
  )
  assert.equal(shown.lines[0]?.values, 60)
})

test("a value published hours ago is current while the machine lives, and stale once it falls silent", async () => {
  const store = demo()
  serve(store)
  const [held] = (await showTimeseries(apis, [{ machine: P04, signal: OVERRIDE }], "15m", now)).lines
  assert.deepEqual(held?.now, { value: 0.95, at: ago(300), stale: false })
  assert.equal(held?.values, 0)
  // The heartbeat stops five minutes ago.
  store[`machines/${P04}/${HEARTBEAT}`]!.values = store[`machines/${P04}/${HEARTBEAT}`]!.values.filter((one) => one.at < ago(5))
  const [silent] = (await showTimeseries(apis, [{ machine: P04, signal: OVERRIDE }], "15m", now)).lines
  assert.equal(silent?.now?.stale, true)
})

test("numbers of a third unit are refused: a time series card has two y axes", async () => {
  serve(demo())
  await assert.rejects(
    showTimeseries(
      apis,
      [
        { machine: P04, signal: "activePower" },
        { machine: P04, signal: BEARING },
        { machine: P04, signal: OVERRIDE },
      ],
      "1h",
      now,
    ),
    /3 units \(watt, degreeCelsius, one\), and a time series card has 2 y axes/,
  )
})

test("a yes or no is no unit, is not counted, and is read whole for the graph, never thinned", async () => {
  const requested = serve(demo())
  const shown = await showTimeseries(
    apis,
    [
      { machine: P04, signal: "activePower" },
      { machine: P04, signal: BEARING },
      { machine: P04, signal: ROTATING },
    ],
    "1h",
    now,
  )
  assert.deepEqual(shown.lines[2], {
    machine: P04,
    signal: ROTATING,
    path: ROTATING,
    topic: `machines/${P04}/${ROTATING}`,
    kind: "yesNo",
    unit: null,
    now: { value: true, at: ago(10), stale: false },
    low: null,
    high: null,
    values: null,
  })
  // Counting it would read every one: the show reads only its newest.
  const counted = requested.filter((url) => url.pathname.includes(ROTATING) && url.searchParams.get("sorting") !== "Descending")
  assert.deepEqual(counted, [])
  await listTimeseriesSeries(apis, [{ machine: P04, signal: ROTATING }], "24h", undefined, 50, now)
  const reads = requested.filter((url) => url.pathname.includes(ROTATING) && url.searchParams.get("sorting") !== "Descending")
  assert.ok(reads.length > 0)
  assert.ok(reads.every((url) => url.searchParams.get("downsample") === null))
})

test("the lines share their instants, each keeps its own values, and a peak the API kept stays", async () => {
  serve(demo())
  const series = await listTimeseriesSeries(
    apis,
    [
      { machine: P04, signal: "activePower" },
      { machine: P04, signal: ROTATING },
    ],
    "24h",
    undefined,
    48,
    now,
  )
  assert.equal(series.from, ago(24 * 60))
  assert.equal(series.instants[0], series.from)
  assert.equal(series.instants.at(-1), series.to)
  const [power, rotating] = series.lines
  assert.equal(power?.unit, "watt")
  // The peak of 15 kW half an hour ago is one of the values kept, and stands at its own instant.
  const peakAt = series.instants.indexOf(ago(30.5))
  assert.ok(peakAt > 0)
  assert.equal(power?.values[peakAt], 15000)
  // The spindle turned from five hours ago, stopped twenty minutes ago and turned again ten minutes ago.
  assert.equal(rotating?.values[0], null)
  assert.equal(rotating?.values[series.instants.indexOf(ago(300))], true)
  assert.equal(rotating?.values[series.instants.indexOf(ago(20))], false)
  assert.equal(rotating?.values.at(-1), true)
  assert.equal(rotating?.unit, null)
})

test("a value published before the range holds from its beginning", async () => {
  serve(demo())
  const series = await listTimeseriesSeries(apis, [{ machine: P04, signal: OVERRIDE }], "1h", undefined, undefined, now)
  const [override] = series.lines
  assert.equal(override?.note, null)
  assert.ok(override?.values.every((one) => one === 0.95))
})

test("a line breaks where the machine was silent, and goes on with its next value", async () => {
  const store = demo()
  // P-07 was away from 40 to 20 minutes ago: no heartbeat and no value.
  const away = (one: Stored) => one.at < ago(40) || one.at > ago(20)
  store[`machines/${P07}/${HEARTBEAT}`]!.values = store[`machines/${P07}/${HEARTBEAT}`]!.values.filter(away)
  store[`machines/${P07}/${POWER}`]!.values = store[`machines/${P07}/${POWER}`]!.values.filter(away)
  serve(store)
  const series = await listTimeseriesSeries(apis, [{ machine: P07, signal: "activePower" }], "1h", undefined, undefined, now)
  const at = (minutes: number) => series.instants.findIndex((one) => one >= ago(minutes))
  const [power] = series.lines
  assert.equal(power?.values[at(45)], 6000)
  const values = series.instants.map((one, index) => [one, power?.values[index]] as const)
  // It falls silent half a minute after its last sign, and breaks there.
  assert.ok(values.some(([one, value]) => one > ago(40) && one < ago(39) && value === null))
  assert.ok(values.filter(([one]) => one > ago(39) && one < ago(20)).every(([, value]) => value === null))
  assert.equal(power?.values[at(15)], 6000)
})

test("a pair the card asks for again that is gone or a text comes back empty, and says why", async () => {
  serve(demo())
  const series = await listTimeseriesSeries(
    apis,
    [
      { machine: P04, signal: "activePower" },
      { machine: P04, signal: PROGRAM },
      { machine: "gone_X_1", signal: "activePower" },
    ],
    "15m",
    undefined,
    undefined,
    now,
  )
  assert.deepEqual(
    series.lines.map((one) => [one.machine, one.note, one.values.every((value) => value === null)]),
    [
      [P04, null, false],
      [P04, "text", true],
      ["gone_X_1", "noValues", true],
    ],
  )
})

test("the range ends where the card asks, so the graph shows what the words said", async () => {
  serve(demo())
  const series = await listTimeseriesSeries(apis, [{ machine: P04, signal: "activePower" }], "15m", "2026-11-18T10:30:00.000+01:00", undefined, now)
  assert.equal(series.to, "2026-11-18T09:30:00.000Z")
  assert.equal(series.from, "2026-11-18T09:15:00.000Z")
})

test("on the instants of all lines, a line has the value that held, and none across a silence", () => {
  const from = new Date(ago(10))
  const silent = new Map([[P04, [{ from: Date.parse(ago(6)), to: Date.parse(ago(4)) }]]])
  const { instants, lines } = onInstants(
    [
      { machine: P04, path: POWER, topic: POWER, kind: "number", unit: "watt", note: null, measured: [{ at: ago(12), value: 1 }, { at: ago(8), value: 2 }, { at: ago(3), value: 3 }] },
      { machine: P07, path: POWER, topic: `x/${POWER}`, kind: "number", unit: "watt", note: null, measured: [{ at: ago(7), value: 9 }] },
    ],
    silent,
    from,
    now,
  )
  const afterSilence = new Date(Date.parse(ago(6)) + 1).toISOString()
  assert.deepEqual(instants, [ago(10), ago(8), ago(7), ago(6), afterSilence, ago(3), ago(0)])
  // P-04 holds 2 up to where it falls silent, has none in the silence, and goes on with 3.
  assert.deepEqual(lines[0]?.values, [1, 2, 2, 2, null, 3, 3])
  // P-07 was not silent: its value holds across the silence of P-04.
  assert.deepEqual(lines[1]?.values, [null, null, 9, 9, 9, 9, 9])
})

test("the signals a person can add: numbers and yes or no of each machine, by path", async () => {
  serve(demo())
  const signals = await listTimeseriesSignals(apis, now)
  assert.deepEqual(
    signals.machines.map((one) => [one.machine, one.signals.map((signal) => `${signal.path}:${signal.kind}`)]),
    [
      [P04, [`${BEARING}:number`, `${POWER}:number`, `${ROTATING}:yesNo`, `${OVERRIDE}:number`]],
      [P07, [`${POWER}:number`]],
    ],
  )
})

test("a topic named two ways is read once and drawn once", async () => {
  const requested = serve(demo())
  const series = await listTimeseriesSeries(
    apis,
    [
      { machine: P04, signal: "activePower" },
      { machine: P04, signal: POWER },
      { machine: P04, signal: "Consumption.Electricity.Main.AcActivePowerTotal" },
    ],
    "1h",
    undefined,
    undefined,
    now,
  )
  assert.equal(series.lines.length, 1)
  const reads = requested.filter((url) => url.pathname.endsWith(POWER) && url.searchParams.get("downsample") === "true")
  assert.equal(reads.length, 1)
})

test("the heartbeats are asked for together with the lines, not after them", async () => {
  const requested = serve(demo())
  await listTimeseriesSeries(apis, [{ machine: P04, signal: "activePower" }], "1h", undefined, undefined, now)
  const heartbeat = requested.findIndex((url) => url.pathname.endsWith(HEARTBEAT))
  const thinned = requested.findIndex((url) => url.searchParams.get("downsample") === "true")
  assert.ok(heartbeat >= 0 && thinned >= 0)
  // Both are asked before either answers: the heartbeat does not wait for the line.
  assert.ok(heartbeat < thinned, `heartbeat asked at ${heartbeat}, the line at ${thinned}`)
})

test("what the machines published is read once for many changes of a card", async () => {
  const requested = serve(demo())
  for (const range of ["15m", "1h", "8h"] as const) {
    await listTimeseriesSeries(apis, [{ machine: P04, signal: "activePower" }], range, undefined, undefined, now)
  }
  await listTimeseriesSignals(apis, now)
  assert.equal(requested.filter((url) => url.pathname === "/topics").length, 1)
})
