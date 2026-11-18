import { HORIZON_SECONDS, READING_PATHS, SILENT_AFTER_SECONDS } from "@pleiades/cards/machine/contract.ts"
import { QUANTITIES, QUANTITY_PATHS } from "@pleiades/cards/measurement/contract.ts"
import { MOST_UNITS, RANGE_SECONDS, TIMESERIES_POINTS, TIMESERIES_RANGE } from "@pleiades/cards/timeseries/contract.ts"
import type {
  AskedLine,
  LineNote,
  SeriesLine,
  SignalKind,
  TimeseriesLine,
  TimeseriesRange,
  TimeseriesSeries,
  TimeseriesShow,
  TimeseriesSignals,
} from "@pleiades/cards/timeseries/contract.ts"

import { listTopicKinds, readNewest, readStatistics, readTimelines } from "./apis.ts"
import type { Apis, Newest, Timeline, TopicKinds } from "./apis.ts"
import { silences, silentBetween } from "./liveness.ts"
import type { Stretch } from "./liveness.ts"
import { machineOf } from "./machines.ts"
import { slotted } from "./measurements.ts"
import { secondsBefore } from "./time.ts"

// Signals a person names, of any machine, over a range: what the time series card draws. Each value
// keeps the unit it was published in; nothing is converted (ADR-0002, ADR-0015).

/** What a topic below a machine carries. A text is known, so that a line of it can say why it draws nothing. */
type Carried = SignalKind | "text"

/** The namespaces below a machine whose values are signals: the data model and the manufacturer. */
const NAMESPACES = ["umati", "oem"] as const

/** A sign of life and nothing else: no line. */
const HEARTBEAT = READING_PATHS.heartbeat

/**
 * What each machine published in the last 24 hours, by path below the machine: a number, a yes or
 * no, or a text. Only paths below `umati/` and `oem/` count, and not the heartbeat.
 */
export function signalsOf(kinds: TopicKinds): Map<string, Map<string, Carried>> {
  const machines = new Map<string, Map<string, Carried>>()
  const add = (topics: ReadonlyArray<string>, carried: Carried) => {
    for (const topic of topics) {
      const machine = machineOf(topic)
      if (machine === undefined) continue
      const path = topic.slice(`machines/${machine}/`.length)
      if (!NAMESPACES.some((one) => path.startsWith(`${one}/`)) || path === HEARTBEAT) continue
      const signals = machines.get(machine) ?? new Map<string, Carried>()
      signals.set(path, carried)
      machines.set(machine, signals)
    }
  }
  add(kinds.texts, "text")
  add(kinds.numbers, "number")
  add(kinds.yesNo, "yesNo")
  return machines
}

/**
 * The path of a signal as a person or a language model names it, among the paths a machine
 * published: a path below the machine (umati/Spindle/1/Override), the same without its namespace
 * if only one namespace has it (Spindle/1/Override), an element of the data model
 * (Spindle.1.Override), a signal of the manufacturer as the model names it
 * (x-alcyone-machines-example.Spindle.1.BearingTemperature), or a quantity of the measurement card
 * (activePower). Undefined if it is none of these.
 */
export function resolveSignal(asked: string, published: ReadonlyMap<string, Carried>): string | undefined {
  const name = asked.trim()
  const quantity = QUANTITIES.find((one) => one === name)
  // A quantity of the measurement card counts only where the machine publishes it.
  if (quantity !== undefined) return published.has(QUANTITY_PATHS[quantity]) ? QUANTITY_PATHS[quantity] : undefined
  let path = name
  if (!name.includes("/") && name.includes(".")) {
    const [first, ...rest] = name.split(".")
    path = first?.startsWith("x-") ? `oem/${rest.join("/")}` : `umati/${name.split(".").join("/")}`
  }
  if (published.has(path)) return path
  if (NAMESPACES.some((one) => path.startsWith(`${one}/`))) return undefined
  const found = NAMESPACES.map((one) => `${one}/${path}`).filter((one) => published.has(one))
  return found.length === 1 ? found[0] : undefined
}

/** A line of the card as it is read: the pair asked for, and where its values lie. */
type Resolved = { machine: string; signal: string; path: string; topic: string; kind: SignalKind }

/** Each topic once, where it was first asked for: a pair named twice, also in two ways, is one line. */
function onceByTopic<TLine extends { topic: string }>(lines: ReadonlyArray<TLine>): Array<TLine> {
  return lines.filter((one, index) => lines.findIndex((other) => other.topic === one.topic) === index)
}

/**
 * The lines asked for, resolved against what the machines published in the last 24 hours. A
 * machine that published nothing, a signal it does not have and a text are refused, with the words
 * of what there is instead: a language model reads them and asks again.
 */
export function resolveLines(asked: ReadonlyArray<AskedLine>, published: Map<string, Map<string, Carried>>): Array<Resolved> {
  const lines = asked.map((one): Resolved => {
    const signals = published.get(one.machine)
    if (signals === undefined) {
      const known = [...published.keys()].sort()
      throw new Error(`No machine "${one.machine}" published a value in the last 24 hours. Machines that did: ${known.join(", ") || "none"}.`)
    }
    const path = resolveSignal(one.signal, signals)
    const drawable = [...signals].filter(([, carried]) => carried !== "text").map(([known]) => known).sort()
    if (path === undefined) {
      throw new Error(
        `${one.machine} published no signal "${one.signal}" in the last 24 hours. Its numbers and yes or no, by path: ${drawable.join(", ") || "none"}.`,
      )
    }
    const carried = signals.get(path)
    if (carried === "text" || carried === undefined) {
      throw new Error(`${path} of ${one.machine} is a text, and a time series draws numbers and yes or no. The signals it can draw: ${drawable.join(", ") || "none"}.`)
    }
    return { machine: one.machine, signal: one.signal, path, topic: `machines/${one.machine}/${path}`, kind: carried }
  })
  return onceByTopic(lines)
}

/** Where a range ends and begins: up to `to`, or up to now. */
function rangeOf(range: TimeseriesRange, to: Date): { from: Date; to: Date } {
  return { from: secondsBefore(to, RANGE_SECONDS[range]), to }
}

/**
 * The heartbeats of each machine over a range, and just before it, which say whether the machine was
 * there where the range begins. They do not depend on the values of the lines, so they are read
 * together with them.
 */
async function readHeartbeats(apis: Apis, machines: ReadonlyArray<string>, from: Date, to: Date): Promise<Map<string, Array<string>>> {
  const read = await Promise.all(
    machines.map((machine) => readTimelines(apis, "baseUnitValues", `machines/${machine}/${HEARTBEAT}`, secondsBefore(from, SILENT_AFTER_SECONDS), to)),
  )
  return new Map(
    machines.map((machine, index) => [
      machine,
      read[index]?.find((one) => one.topic === `machines/${machine}/${HEARTBEAT}`)?.samples.map((one) => one.at) ?? [],
    ]),
  )
}

/** The silences of every machine between two instants, from its heartbeats and the values read of it: every value is a sign of life. */
function silencesOf(
  heartbeats: ReadonlyMap<string, ReadonlyArray<string>>,
  from: Date,
  to: Date,
  values: (machine: string) => ReadonlyArray<string>,
): Map<string, Array<Stretch>> {
  return new Map(
    [...heartbeats].map(([machine, beats]) => [machine, silences([...beats, ...values(machine)], from.toISOString(), to.toISOString())]),
  )
}

/**
 * What the machines published in the last 24 hours, by kind. It changes as machines come and go,
 * not with every click on a card, so it is kept for a minute: a card asks for its lines again on
 * every change, and `/topics` over a day need not be read for each.
 */
const PUBLISHED_SECONDS = 60
const published = new Map<string, { at: number; kinds: Promise<TopicKinds> }>()

async function publishedSignals(apis: Apis, to: Date): Promise<Map<string, Map<string, Carried>>> {
  const kept = published.get(apis.timeseriesUrl)
  const fresh = kept !== undefined && Math.abs(Date.now() - kept.at) < PUBLISHED_SECONDS * 1000
  const kinds = fresh ? kept.kinds : listTopicKinds(apis, secondsBefore(to, HORIZON_SECONDS), to)
  if (!fresh) {
    published.set(apis.timeseriesUrl, { at: Date.now(), kinds })
    // A failure is not kept: the next call asks again.
    kinds.catch(() => published.delete(apis.timeseriesUrl))
  }
  return signalsOf(await kinds)
}

/** Forgets what the machines published, so the next call reads it anew: for tests, which change it. */
export function forgetPublished(): void {
  published.clear()
}

const kindOfStore = (kind: SignalKind) => (kind === "number" ? "baseUnitValues" : "booleanValues")

/** The values of a line between two instants: thinned by the Timeseries API for numbers, whole for a yes or no. */
async function readLine(apis: Apis, line: Pick<Resolved, "topic" | "kind">, from: Date, to: Date, points: number): Promise<Timeline | undefined> {
  const timelines =
    line.kind === "number" ? await readTimelines(apis, "baseUnitValues", line.topic, from, to, points) : await readTimelines(apis, "booleanValues", line.topic, from, to)
  return timelines.find((one) => one.topic === line.topic)
}

/**
 * The time series card: for each line its newest value, whether it is current, and its smallest and
 * largest value over the range. A card holds numbers of two units at most, one for each of its y
 * axes; more are refused.
 */
export async function showTimeseries(apis: Apis, asked: ReadonlyArray<AskedLine>, range: TimeseriesRange = TIMESERIES_RANGE, now = new Date()): Promise<TimeseriesShow> {
  const { from, to } = rangeOf(range, now)
  const resolved = resolveLines(asked, await publishedSignals(apis, to))
  const machines = [...new Set(resolved.map((one) => one.machine))]
  const [heartbeats, read] = await Promise.all([
    readHeartbeats(apis, machines, from, to),
    Promise.all(
      resolved.map(async (line) => {
        // A yes or no is not counted: the API would hand over every one of them for one number.
        const [newest, statistics] = await Promise.all([
          readNewest(apis, kindOfStore(line.kind), line.topic, to),
          line.kind === "number" ? readStatistics(apis, line.topic, from, to) : undefined,
        ])
        const stats = statistics?.get(line.topic)
        return { line, newest, stats, count: line.kind === "number" ? (stats?.count ?? 0) : null }
      }),
    ),
  ])
  const units = [...new Set(read.flatMap(({ line, newest, stats }) => (line.kind === "number" ? (stats?.unit ?? newest?.unit ?? []) : [])))]
  if (units.length > MOST_UNITS) {
    throw new Error(
      `These lines are in ${units.length} units (${units.join(", ")}), and a time series card has ${MOST_UNITS} y axes, one unit each. Ask for the lines of at most ${MOST_UNITS} units, and the others in a second card.`,
    )
  }
  const newestOf = (machine: string) => read.filter(({ line }) => line.machine === machine).flatMap(({ newest }) => (newest ? [newest.at] : []))
  const silent = silencesOf(heartbeats, from, to, newestOf)
  const lines = read.map(({ line, newest, stats, count }): TimeseriesLine => {
    const unit = line.kind === "number" ? (stats?.unit ?? newest?.unit ?? null) : null
    return {
      ...line,
      unit,
      now: nowOf(newest, silent.get(line.machine) ?? [], from, to),
      low: stats && stats.count > 0 ? stats.min : null,
      high: stats && stats.count > 0 ? stats.max : null,
      values: count,
    }
  })
  return { from: from.toISOString(), to: to.toISOString(), range, lines }
}

/**
 * The newest value of a line and whether it is current. A machine sends every value anew after it
 * was away (contracts/mqtt, "Manifest and connection"), so a value however old is current as long as
 * the machine was not silent within the range since it.
 */
export function nowOf(newest: Newest | null, silent: ReadonlyArray<Stretch>, from: Date, to: Date): TimeseriesLine["now"] {
  if (newest === null) return null
  const since = Math.max(Date.parse(newest.at), from.getTime())
  return { value: newest.value, at: newest.at, stale: silentBetween(silent, new Date(since).toISOString(), to.toISOString()) }
}

/** A line of the series as it is read, before it is put on the instants of all lines. */
type ReadLine = { machine: string; path: string; topic: string; kind: SignalKind; unit: string | null; note: LineNote | null; measured: Array<{ at: string; value: number | boolean }> }

/**
 * The lines on the instants of all of them: every instant at which a line has a value, where the
 * range begins and ends, and where a machine falls silent. At each a line has the value that held,
 * as `slotted` gives it: also where it has no value of its own, but not across a silence.
 */
export function onInstants(
  lines: ReadonlyArray<ReadLine>,
  silent: ReadonlyMap<string, ReadonlyArray<Stretch>>,
  from: Date,
  to: Date,
): Pick<TimeseriesSeries, "instants" | "lines"> {
  const start = from.getTime()
  const end = to.getTime()
  const times = new Set<number>([start, end])
  for (const line of lines) {
    for (const one of line.measured) {
      const time = Date.parse(one.at)
      if (time >= start && time <= end) times.add(time)
    }
  }
  // Where a machine falls silent its lines hold up to there, and break a millisecond after.
  for (const stretches of silent.values()) {
    for (const one of stretches) {
      if (one.from > start && one.from < end) times.add(one.from)
      if (one.from + 1 > start && one.from + 1 < end) times.add(one.from + 1)
    }
  }
  const instants = [...times].sort((a, b) => a - b).map((time) => new Date(time).toISOString())
  return {
    instants,
    lines: lines.map(({ measured, ...line }): SeriesLine => ({ ...line, values: slotted(measured, instants, silent.get(line.machine) ?? []) })),
  }
}

/**
 * The lines of a time series card over a range, up to `to` or up to now: what its graph draws. Numbers
 * are thinned by the Timeseries API to about `points` values a line (LTTB), a yes or no is read
 * whole: the API thins it by taking every n-th value and would lose a change. A line begins with
 * the value that held where the range begins.
 *
 * A pair that does not resolve is not refused here, as the card asks again with lines it already
 * has: it comes back without values and says why.
 */
export async function listTimeseriesSeries(
  apis: Apis,
  asked: ReadonlyArray<AskedLine>,
  range: TimeseriesRange = TIMESERIES_RANGE,
  until?: string,
  points = TIMESERIES_POINTS,
  now = new Date(),
): Promise<TimeseriesSeries> {
  const { from, to } = rangeOf(range, until === undefined ? now : new Date(until))
  const signals = await publishedSignals(apis, to)
  // Resolved first, so a topic named two ways is read once.
  const resolved = onceByTopic(
    asked.map((one) => {
      const ofMachine = signals.get(one.machine) ?? new Map<string, Carried>()
      const path = resolveSignal(one.signal, ofMachine) ?? one.signal.trim()
      return { machine: one.machine, path, topic: `machines/${one.machine}/${path}`, carried: ofMachine.get(path) }
    }),
  )
  const machines = [...new Set(resolved.filter((one) => one.carried === "number" || one.carried === "yesNo").map((one) => one.machine))]
  const [heartbeats, lines] = await Promise.all([
    readHeartbeats(apis, machines, from, to),
    Promise.all(
      resolved.map(async ({ machine, path, topic, carried }): Promise<ReadLine> => {
        if (carried === undefined || carried === "text") {
          return { machine, path, topic, kind: "number", unit: null, note: carried === "text" ? "text" : "noValues", measured: [] }
        }
        const [held, timeline] = await Promise.all([
          readNewest(apis, kindOfStore(carried), topic, from),
          readLine(apis, { topic, kind: carried }, from, to, points),
        ])
        const samples = timeline?.samples ?? []
        const measured = [...(held ? [{ at: held.at, value: held.value }] : []), ...samples]
        const unit = carried === "number" ? (timeline?.unit ?? held?.unit ?? null) : null
        return { machine, path, topic, kind: carried, unit, note: measured.length === 0 ? "noValues" : null, measured }
      }),
    ),
  ])
  const valuesOf = (machine: string) =>
    lines.filter((one) => one.machine === machine).flatMap((one) => one.measured.map((sample) => sample.at))
  const silent = silencesOf(heartbeats, from, to, valuesOf)
  return { from: from.toISOString(), to: to.toISOString(), range, ...onInstants(lines, silent, from, to) }
}

/** What each machine published in the last 24 hours that a time series can draw, by path: what a person can add to a card. */
export async function listTimeseriesSignals(apis: Apis, now = new Date()): Promise<TimeseriesSignals> {
  const published = await publishedSignals(apis, now)
  const machines = [...published.keys()].sort().map((machine) => ({
    machine,
    signals: [...(published.get(machine) ?? [])]
      .flatMap(([path, carried]) => (carried === "text" ? [] : [{ path, kind: carried }]))
      .sort((a, b) => a.path.localeCompare(b.path)),
  }))
  return { asOf: now.toISOString(), machines: machines.filter((one) => one.signals.length > 0) }
}
